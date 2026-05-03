import { createAgentSession, simulateBalloon, submitScore, sleep, WIN_THRESHOLD, AgentRunResult } from './lib/session.js'

export async function runSpeedDemon(): Promise<AgentRunResult> {
  const session = await createAgentSession()
  await session.startGame()

  const start = Date.now()

  await new Promise<void>(resolve => {
    const interval = setInterval(() => {
      session.pump()
      const size = simulateBalloon(session.receivedPumps(), Date.now() - start)
      if (size >= WIN_THRESHOLD) { clearInterval(interval); resolve() }
    }, 10)
  })

  const timeMs = Date.now() - start
  const pumps = session.receivedPumps()
  await submitScore('SPEED', pumps, timeMs, 'speed-demon')
  session.cleanup()

  return {
    name: 'speed-demon',
    passed: true,
    metrics: { pumps, timeMs },
    lines: [`  won in ${(timeMs / 1000).toFixed(2)}s with ${pumps} pumps`],
  }
}

if (process.argv[1].includes('speed-demon')) {
  runSpeedDemon().then(r => { console.log(r.lines[0]); process.exit(0) })
}
