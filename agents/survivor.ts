import { createAgentSession, simulateBalloon, submitScore, WIN_THRESHOLD, PUMP_AMOUNT, DECAY_INTERVAL_MS, AgentRunResult } from './lib/session.js'

// Equilibrium: pump every (DECAY_INTERVAL_MS * PUMP_AMOUNT) = 420ms → net gain = 0
// Survivor pumps every 300ms → net gain = +0.86 units/cycle → wins in ~35s
// This is the slowest viable strategy: just above the fixed point where gain = loss.
const INTERVAL_MS = 300

export async function runSurvivor(): Promise<AgentRunResult> {
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
  const equilibriumMs = DECAY_INTERVAL_MS * PUMP_AMOUNT
  await submitScore('SURV', pumps, timeMs, 'survivor')
  session.cleanup()

  return {
    name: 'survivor',
    passed: true,
    metrics: { pumps, timeMs, intervalMs: INTERVAL_MS, equilibriumMs },
    lines: [`  won in ${(timeMs / 1000).toFixed(2)}s with ${pumps} pumps (equilibrium at ${equilibriumMs}ms)`],
  }
}

if (process.argv[1].includes('survivor')) {
  runSurvivor().then(r => { console.log(r.lines[0]); process.exit(0) })
}
