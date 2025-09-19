# Agent: AEMET Weather Alert Reader

## Purpose
Automatically fetch, process and analyze official weather alerts from AEMET for specific zones (e.g., Castellón and Andalucía). Displays current alert level (CRÍTICO, MEDIO, NORMALIDAD) on a web UI every 10 minutes.

## Components

### 1. Cron (backend/cron-aemet.ts)
- Runs every 10 min
- Calls AEMET API for each zone (77, 61)
- Extracts XML alerts from .tar.gz files
- Maps severity to 3 levels: CRÍTICO, MEDIO, NORMALIDAD
- Writes simplified JSON to `public/data/aemet_avisos.json`

### 2. Frontend (React + Tailwind)
- Loads JSON alerts
- Displays status per zone
- Uses responsive, color-coded cards

### 3. Agent Logic
- Alert level is based on highest severity found:
  - CRÍTICO → if any "CRÍTICA"
  - MEDIO → if any "MEDIA" and none "CRÍTICA"
  - NORMALIDAD → all are "NORMAL"

## Zones
- Area 77: Comunidad Valenciana (Castellón)
- Area 61: Andalucía

## Output
- Visual dashboard
- Each zone shows current status card (CRÍTICO, MEDIO or NORMALIDAD)

## Data Source
- Official AEMET OpenData API


