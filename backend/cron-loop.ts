import { spawn } from 'node:child_process'

const TEN_MINUTES_MS = 10 * 60 * 1000
let isRunning = false

async function runOnce(): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      '--env-file=.env.local',
      '--import', 'tsx',
      'backend/cron-aemet.ts',
    ], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    })
    child.on('exit', () => resolve())
    child.on('error', () => resolve())
  })
}

async function loop() {
  if (isRunning) return
  isRunning = true
  try {
    await runOnce()
  } finally {
    isRunning = false
  }
}

// Primera ejecución inmediata
loop().catch(() => {})

// Repetir cada 10 minutos, evitando solapes
setInterval(() => {
  if (!isRunning) loop().catch(() => {})
}, TEN_MINUTES_MS)


