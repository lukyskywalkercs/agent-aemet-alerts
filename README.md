# Agente IA Lector de Avisos AEMET

- Backend: `backend/cron-aemet.ts` descarga avisos oficiales (AEMET OpenData) y escribe `public/data/aemet_avisos.json`.
- Frontend: React + Tailwind muestra estado por zonas 77 y 61 en `src/components/AvisosAEMET.tsx`.

## Variables de entorno
Crea `.env.local` en la raíz con:

```
AEMET_API_KEY=tu_api_key
```

## Scripts
- `npm run cron:aemet` → ejecuta el cron una vez
