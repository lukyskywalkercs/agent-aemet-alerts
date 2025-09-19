import { useEffect, useState } from 'react'
import './index.css'
import AvisosAEMET from './components/AvisosAEMET'

type Aviso = {
  zona: string;
  nivel: 'NORMALIDAD' | 'MEDIA' | 'CRÍTICA';
  evento?: string;
  desde?: string;
  hasta?: string;
};

function App() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/data/aemet_avisos.json', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setAvisos(Array.isArray(data) ? data : [])
      } catch (e: any) {
        setError(e?.message || 'Error cargando avisos')
      }
    }
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-semibold">Agente IA Lector de Avisos AEMET</h1>
          <p className="text-sm text-gray-600">Actualización cada 10 minutos desde datos oficiales AEMET</p>
        </div>
      </header>
      <main>
        {error && (
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="p-3 rounded border border-red-400 bg-red-50 text-red-800">
              Error: {error}
            </div>
          </div>
        )}
        <AvisosAEMET avisos={avisos} />
      </main>
    </div>
  )
}

export default App
