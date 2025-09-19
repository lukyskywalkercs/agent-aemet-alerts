# 🌪️ Agente IA AVISOS AEMET (prueba técnica)

> ⚠️ **ESTE NO ES UN SISTEMA OFICIAL**  
> 🚫 **NO USAR EN EMERGENCIAS REALES**  
> 🧪 Proyecto de prueba técnica desarrollado por **Lucas Chabrera Querol** ([@lukyskywalkercs](https://github.com/lukyskywalkercs))

---

## 🧠 ¿Qué es esto?

Este repositorio contiene una **prueba funcional** para mostrar alertas meteorológicas de la **API pública de AEMET** en una web simple.

- **No es oficial**
- **No tiene garantías**
- **No es un agente inteligente real**
- **No debe usarse en contextos institucionales ni críticos**

Es solo un proyecto personal de exploración técnica.

---

## 🎯 ¿Para qué sirve?

- Ver cómo funciona el acceso a la API de AEMET
- Probar la descarga y descompresión de archivos `.tar.gz`
- Procesar archivos XML de alertas en formato **CAP**
- Mostrar en una web sencilla los avisos por subzona y nivel de riesgo (`CRÍTICA`, `MEDIA`, `NORMALIDAD`)

---

## ✅ Características

- 🔁 Consulta cada 10 minutos la API oficial de AEMET
- 📦 Ingesta robusta: TAR/ZIP/GZ, redirecciones, timeouts y reintentos; decodificación ISO‑8859‑15
- 🧠 Procesa CAP: subzonas (geocode zona), fenómeno, valor, probabilidad, comentario, inicio/fin
- 🛡️ Política de verdad: solo datos oficiales; si falla, JSON vacío (sin inventar)
- 🧮 Severidad consolidada: CRÍTICA/MEDIA/NORMALIDAD por subzona y área (vigentes)
- 🔎 Deduplicación: clave subzona|evento|desde|hasta|nivel
- 🧾 Auditoría: `aemet_meta.json` con fuente y timestamp
- 💾 Memoria del agente: `agents/memory/state.json` (cambios por subzona con cooldown)
- 🖥️ Panel del agente en la UI: última ejecución, estado por áreas, cambios recientes (`agent_ui.json`)
- 🔌 Notificaciones enchufables: preparado para añadir Slack/Email/SMS
- 🧱 Escalable y componible: backend/agent/frontend desacoplados; fácil orquestar con otros agentes

---

## ⚙️ Tecnologías utilizadas

- `React + TypeScript + TailwindCSS` para el frontend
- `Node.js + cron` para descargar los datos
- `fast-xml-parser`, `adm-zip`, `tar`, `iconv-lite` para procesar los avisos de AEMET
- `Vite` para desarrollo rápido

---

## 📦 ¿Qué hace realmente?

1. Cada 10 minutos, el archivo `backend/cron-aemet.ts`:
   - Consulta el endpoint oficial de AEMET
   - Descarga un archivo `.tar.gz` por zona (ej: 77 = Comunidad Valenciana)
   - Extrae los XML con alertas meteorológicas
   - Convierte los datos en un JSON simplificado:  
     `public/data/aemet_avisos.json`

2. El frontend:
   - Lee ese JSON
   - Muestra todas las subzonas con sus avisos activos (sin agrupar, sin IA)

---

## 🗂️ Estructura del proyecto

```
/backend/cron-aemet.ts         # descarga y procesa avisos
/public/data/aemet_avisos.json # datos procesados
/src/components/AvisosAEMET.tsx# muestra los avisos tal cual
/src/index.css                 # TailwindCSS base
```

---

## ❌ ¿Qué **NO** tiene este proyecto?

- No tiene IA real (es una app estática + cron)
- No tiene autenticación
- No tiene validación jurídica ni técnica
- No cumple normativas de sistemas críticos

---

## 📖 Licencia

MIT © Lucas Chabrera Querol  
Distribuido solo con fines educativos.

---

🧠 Recuerda: esto es una DEMO, no un sistema de protección civil.
