/*
  Cron AEMET: descarga y procesa avisos CAP oficiales.
  - No inventa datos. Lee sólo desde la API oficial de AEMET OpenData.
  - Requiere variable de entorno AEMET_API_KEY.
  - Escribe salida simplificada en public/data/aemet_avisos.json
*/

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import zlib from 'node:zlib'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import { XMLParser } from 'fast-xml-parser'
import iconv from 'iconv-lite'

type AvisoSalida = {
  zona: string // código subzona AEMET (p.ej. 771204)
  nivel: 'NORMALIDAD' | 'MEDIA' | 'CRÍTICA'
  evento?: string
  desde?: string
  hasta?: string
  desc?: string // areaDesc (descripción oficial subzona)
  probabilidad?: string
  valor?: string
  comentario?: string
  parametros?: any[]
}

const ZONAS = ['77', '61']

async function fetchJson<T = any>(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: ac.signal as any })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json() as T
  } finally {
    clearTimeout(timer)
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 500): Promise<T> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

async function fetchBuffer(url: string, headers: Record<string, string>, timeoutMs = 12000): Promise<Buffer> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'agent-aemet-alerts/1.0', ...headers }, redirect: 'follow', signal: ac.signal as any })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const arrayBuf = await res.arrayBuffer()
    return Buffer.from(arrayBuf)
  } finally {
    clearTimeout(timer)
  }
}

async function obtenerUrlDatos(endpoint: string, apiKey: string): Promise<string> {
  // La API de AEMET devuelve un objeto con campos: estado, datos, metadatos...
  const meta = await withRetry(() => fetchJson<any>(endpoint, { 'api_key': apiKey }, 12000), 2, 600)
  if (!meta?.datos) throw new Error('Respuesta sin campo datos')
  return meta.datos as string
}

function mapearSeveridadATresNiveles(valor?: string): AvisoSalida['nivel'] {
  const v = (valor || '').trim().toUpperCase()
  // CAP oficial: EXTREME, SEVERE, MODERATE, MINOR, UNKNOWN
  if (v === 'EXTREME' || v === 'SEVERE') return 'CRÍTICA'
  if (v === 'MODERATE') return 'MEDIA'
  if (v === 'MINOR' || v === 'UNKNOWN') return 'NORMALIDAD'
  // Fallback por si AEMET localiza textos (no inventamos, solo agrupamos):
  if (v.includes('EXTREMO') || v.includes('SEVERO')) return 'CRÍTICA'
  if (v.includes('MODERADO')) return 'MEDIA'
  return 'NORMALIDAD'
}

function ensureArray<T>(val: any): T[] {
  if (Array.isArray(val)) return val
  if (val === undefined || val === null) return []
  return [val as T]
}

async function procesarCAPXmlSimple(xml: string): Promise<AvisoSalida[]> {
  // Parser robusto de XML; mantiene nombres con namespace (cap:severity, etc.)
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true })
    const doc = parser.parse(xml)
    const resultados: AvisoSalida[] = []

    // Caso A: feed Atom con entries CAP
    const feed = doc.feed || doc['atom:feed']
    if (feed) {
      const entries = ensureArray<any>(feed?.entry)
      for (const e of entries) {
        const infoList = ensureArray<any>(e?.['cap:info'] || e?.content?.['cap:info'] || e?.info)
        for (const info of infoList) {
          const severity = info?.['cap:severity'] || info?.severity
          const event = info?.['cap:event'] || info?.event
          const onset = info?.['cap:onset'] || info?.onset
          const expires = info?.['cap:expires'] || info?.expires
          const probability = info?.['cap:probability'] || info?.probability
          const description = info?.['cap:description'] || info?.description
          const parameters = ensureArray<any>(info?.['cap:parameter'] || info?.parameter)
          let valorField: string | undefined
          if (parameters.length > 0) {
            const first = parameters[0]
            const v = first?.value
            if (typeof v === 'string') valorField = v
            else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') valorField = v[0]
          }
          const areas = ensureArray<any>(info?.['cap:area'] || info?.area)
          for (const area of areas) {
            const areaDesc = (area?.['cap:areaDesc'] || area?.areaDesc || '').toString().trim()
            const geocodes = ensureArray<any>(area?.['cap:geocode'] || area?.geocode)
            const zonaGc = geocodes.find((gc: any) => ((gc?.valueName || '').toString().toLowerCase().includes('zona')))
            const subzona = (zonaGc?.value || '').toString().trim()
            if (!subzona) continue
            const nivel = mapearSeveridadATresNiveles(typeof severity === 'string' ? severity : '')
            resultados.push({
              zona: subzona,
              nivel,
              evento: typeof event === 'string' ? event : undefined,
              desde: typeof onset === 'string' ? onset : undefined,
              hasta: typeof expires === 'string' ? expires : undefined,
              desc: areaDesc || undefined,
              probabilidad: typeof probability === 'string' ? probability : undefined,
              valor: valorField,
              comentario: typeof description === 'string' ? description : undefined,
              parametros: parameters.length ? parameters : undefined,
            })
          }
        }
      }
    }

    // Caso B: documentos CAP por aviso con raíz <alert>
    const alerts = ensureArray<any>(doc.alert || doc['cap:alert'])
    for (const alert of alerts) {
      const infoList = ensureArray<any>(alert?.info || alert?.['cap:info'])
      for (const info of infoList) {
        const severity = info?.severity || info?.['cap:severity']
        const event = info?.event || info?.['cap:event']
        const onset = info?.onset || info?.['cap:onset']
        const expires = info?.expires || info?.['cap:expires']
        const probability = info?.probability || info?.['cap:probability']
        const description = info?.description || info?.['cap:description']
        const parameters = ensureArray<any>(info?.parameter || info?.['cap:parameter'])
        let valorField: string | undefined
        if (parameters.length > 0) {
          const first = parameters[0]
          const v = first?.value
          if (typeof v === 'string') valorField = v
          else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') valorField = v[0]
        }
        const areas = ensureArray<any>(info?.area || info?.['cap:area'])
        for (const area of areas) {
          const areaDesc = (area?.areaDesc || area?.['cap:areaDesc'] || '').toString().trim()
          const geocodes = ensureArray<any>(area?.geocode || area?.['cap:geocode'])
          const zonaGc = geocodes.find((gc: any) => ((gc?.valueName || '').toString().toLowerCase().includes('zona')))
          const subzona = (zonaGc?.value || '').toString().trim()
          if (!subzona) continue
          const nivel = mapearSeveridadATresNiveles(typeof severity === 'string' ? severity : '')
          resultados.push({
            zona: subzona,
            nivel,
            evento: typeof event === 'string' ? event : undefined,
            desde: typeof onset === 'string' ? onset : undefined,
            hasta: typeof expires === 'string' ? expires : undefined,
            desc: areaDesc || undefined,
            probabilidad: typeof probability === 'string' ? probability : undefined,
            valor: valorField,
            comentario: typeof description === 'string' ? description : undefined,
            parametros: parameters.length ? parameters : undefined,
          })
        }
      }
    }
    if (resultados.length > 0) {
      // deduplicar por clave: subzona|evento|desde|hasta|nivel
      const seen = new Set<string>()
      const dedup: AvisoSalida[] = []
      for (const a of resultados) {
        const key = `${a.zona}|${a.evento || ''}|${a.desde || ''}|${a.hasta || ''}|${a.nivel}`
        if (seen.has(key)) continue
        seen.add(key)
        dedup.push(a)
      }
      return dedup
    }
  } catch {}
  // Fallback mínimo por regex si el XML no es estándar
  const resultados: AvisoSalida[] = []
  const entries = xml.split('<entry>').slice(1)
  for (const entry of entries) {
    const zonaMatch = entry.match(/<geocode>[\s\S]*?<valueName>\s*zona\s*<\/valueName>[\s\S]*?<value>(.*?)<\/value>[\s\S]*?<\/geocode>/i)
    const severityMatch = entry.match(/<cap:severity>(.*?)<\/cap:severity>/)
    const eventMatch = entry.match(/<cap:event>(.*?)<\/cap:event>/)
    const onsetMatch = entry.match(/<cap:onset>(.*?)<\/cap:onset>/)
    const expiresMatch = entry.match(/<cap:expires>(.*?)<\/cap:expires>/)
    const areaDescMatch = entry.match(/<cap:areaDesc>(.*?)<\/cap:areaDesc>/)
    const zona = zonaMatch?.[1]?.trim() || ''
    if (!zona) continue
    const nivel = mapearSeveridadATresNiveles(severityMatch?.[1])
    resultados.push({
      zona,
      nivel,
      evento: eventMatch?.[1]?.trim(),
      desde: onsetMatch?.[1]?.trim(),
      hasta: expiresMatch?.[1]?.trim(),
      desc: areaDescMatch?.[1]?.trim(),
    })
  }
  // dedup
  const seen = new Set<string>()
  const dedup: AvisoSalida[] = []
  for (const a of resultados) {
    const key = `${a.zona}|${a.evento || ''}|${a.desde || ''}|${a.hasta || ''}|${a.nivel}`
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(a)
  }
  return dedup
}

async function extraerXmlsDesdeRecurso(origenUrl: string, data: Buffer, tmpRoot: string): Promise<string[]> {
  const lowered = origenUrl.toLowerCase()
  // Caso 1: XML directo
  if (data.slice(0, 100).toString('utf8').trim().startsWith('<?xml')) {
    return [decodeXmlBuffer(data)]
  }

  const xmls: string[] = []

  // Detección de TAR por firma 'ustar' (offset 257) aunque no haya extensión
  try {
    const magic = data.slice(257, 262).toString('binary')
    if (magic === 'ustar') {
      const tarPath = path.join(tmpRoot, 'data.tar')
      await fs.writeFile(tarPath, data)
      await tar.extract({ file: tarPath, cwd: tmpRoot })
      const files = await listarArchivosRecursivo(tmpRoot)
      for (const f of files) {
        if (f.toLowerCase().endsWith('.xml')) {
          xmls.push(await fs.readFile(f, 'utf8'))
        }
      }
      return xmls
    }
  } catch {}

  // Caso 2: .zip
  if (lowered.endsWith('.zip')) {
    const zip = new AdmZip(data)
    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.xml')) {
        const buf = entry.getData()
        xmls.push(decodeXmlBuffer(buf))
      }
    }
    return xmls
  }

  // Caso 3: .gz (posible .tar.gz o xml.gz)
  if (lowered.endsWith('.gz')) {
    const ungz = zlib.gunzipSync(data)
    // Si tras descomprimir es un tar, extraemos; si es XML, devolvemos.
    if (ungz.slice(0, 262).toString('binary', 257, 262) === 'ustar') {
      const tarPath = path.join(tmpRoot, 'data.tar')
      await fs.writeFile(tarPath, ungz)
      await tar.extract({ file: tarPath, cwd: tmpRoot })
      const files = await listarArchivosRecursivo(tmpRoot)
      for (const f of files) {
        if (f.toLowerCase().endsWith('.xml')) {
          const buf = await fs.readFile(f)
          xmls.push(decodeXmlBuffer(buf))
        }
      }
      return xmls
    }
    // No es tar: comprobar si es XML
    if (ungz.slice(0, 100).toString('utf8').trim().startsWith('<?xml')) {
      return [ungz.toString('utf8')]
    }
  }

  // Caso 4: .tar
  if (lowered.endsWith('.tar')) {
    const tarPath = path.join(tmpRoot, 'data.tar')
    await fs.writeFile(tarPath, data)
    await tar.extract({ file: tarPath, cwd: tmpRoot })
    const files = await listarArchivosRecursivo(tmpRoot)
    for (const f of files) {
      if (f.toLowerCase().endsWith('.xml')) {
        const buf = await fs.readFile(f)
        xmls.push(decodeXmlBuffer(buf))
      }
    }
    return xmls
  }

  // Desconocido: intentar interpretar como texto y buscar XML rudimentario
  const asText = data.toString('utf8')
  if (asText.includes('<?xml')) {
    const i = asText.indexOf('<?xml')
    return [asText.slice(i)]
  }
  return []
}

function decodeXmlBuffer(buf: Buffer): string {
  // Detectar encoding desde prolog
  const head = buf.slice(0, 200).toString('ascii')
  const encMatch = head.match(/encoding\s*=\s*"([^"]+)"/i)
  const enc = (encMatch?.[1] || 'utf-8').toLowerCase()
  if (enc.includes('iso-8859-15') || enc.includes('iso-8859-1') || enc.includes('latin')) {
    return iconv.decode(buf, 'ISO-8859-15')
  }
  return buf.toString('utf8')
}

async function listarArchivosRecursivo(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    const items = await fs.readdir(dir, { withFileTypes: true })
    for (const it of items) {
      const p = path.join(dir, it.name)
      if (it.isDirectory()) await walk(p)
      else out.push(p)
    }
  }
  await walk(root)
  return out
}

async function run() {
  console.log('[AEMET] Inicio cron')
  const apiKey = process.env.AEMET_API_KEY
  if (!apiKey) {
    console.error('Falta AEMET_API_KEY en entorno')
    process.exitCode = 1
    return
  }

  // Endpoint definido por entorno. Debe ser PLANTILLA con {area}.
  // Ejemplo (confirmar en documentación oficial antes de usar):
  //   https://opendata.aemet.es/opendata/api/avisos_cap/ultimosavisos/area/{area}
  const endpointTemplate = process.env.AEMET_CAP_ENDPOINT_TEMPLATE
  if (!endpointTemplate || !endpointTemplate.includes('{area}')) {
    console.error('Falta AEMET_CAP_ENDPOINT_TEMPLATE o no contiene {area}. Aborta para evitar rutas inventadas.')
    process.exitCode = 1
    return
  }

  const agregados: AvisoSalida[] = []
  const auditoria: Array<{ area: string; meta_endpoint: string; datos_url: string; fetched_at: string; xmls_encontrados: number; }> = []

  for (const area of ZONAS) {
    try {
      console.log(`[AEMET] procesando área ${area}…`)
      console.time(`[AEMET] área ${area}`)
      const endpoint = endpointTemplate.replace('{area}', area)
      const urlDatos = await obtenerUrlDatos(endpoint, apiKey)
      console.log(`[AEMET] área ${area} fuente datos: ${urlDatos}`)
      const buffer = await withRetry(() => fetchBuffer(urlDatos, {}, 20000), 2, 800)

      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aemet-'))
      try {
        const textosXml = await extraerXmlsDesdeRecurso(urlDatos, buffer, tmpRoot)
        auditoria.push({
          area,
          meta_endpoint: endpoint,
          datos_url: urlDatos,
          fetched_at: new Date().toISOString(),
          xmls_encontrados: textosXml.length,
        })
        for (const xml of textosXml) {
          const avisos = await procesarCAPXmlSimple(xml)
          agregados.push(...avisos)
        }
      } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
        console.timeEnd(`[AEMET] área ${area}`)
      }
    } catch (e) {
      console.error(`Error procesando área ${area}:`, e)
      // Registrar auditoría de fallo mínimo
      try {
        const endpoint = endpointTemplate.replace('{area}', area)
        auditoria.push({
          area,
          meta_endpoint: endpoint,
          datos_url: '',
          fetched_at: new Date().toISOString(),
          xmls_encontrados: 0,
        })
      } catch {}
    }
  }

  const dataDir = path.join(process.cwd(), 'public', 'data')
  await fs.mkdir(dataDir, { recursive: true })
  const salidaPath = path.join(dataDir, 'aemet_avisos.json')
  await fs.writeFile(salidaPath, JSON.stringify(agregados, null, 2), 'utf8')
  const auditPath = path.join(dataDir, 'aemet_meta.json')
  await fs.writeFile(auditPath, JSON.stringify(auditoria, null, 2), 'utf8')
  console.log(`Escrito ${agregados.length} avisos en ${salidaPath}`)
  console.log(`Auditoría de fuentes en ${auditPath}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})


