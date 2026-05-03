import { createAgentSession, simulateBalloon, submitScore, WIN_THRESHOLD, AgentRunResult } from './lib/session.js'

// 200ms = ~5 taps/sec, middle of the empirical 4–6 taps/sec range for casual mobile users
const INTERVAL_MS = 200

export async function runAverageHuman(): Promise<AgentRunResult> {
  const session = await createAgentSession()
  await session.startGame()

  const start = Date.now()

  await new Promise<void>(resolve => {
    const interval = setInterval(() => {
      session.pump()
      const size = simulateBalloon(session.receivedPumps(), Date.now() - start)
      if (size >= WIN_THRESHOLD) { clearInterval(interval); resolve() }
    }, INTERVAL_MS)
  })

  const timeMs = Date.now() - start
  const pumps = session.receivedPumps()
  await submitScore('HUMAN', pumps, timeMs, 'average-human')
  session.cleanup()

  return {
    name: 'average-human',
    passed: true,
    metrics: { pumps, timeMs, intervalMs: INTERVAL_MS },
    lines: [`  won in ${(timeMs / 1000).toFixed(2)}s with ${pumps} pumps`],
  }
}

if (process.argv[1].includes('average-human')) {
  runAverageHuman().then(r => { console.log(r.lines[0]); process.exit(0) })
}
