import { createAgentSession, simulateBalloon, submitScore, WIN_THRESHOLD, PUMP_AMOUNT, DECAY_AMOUNT, DECAY_INTERVAL_MS, AgentRunResult } from './lib/session.js'

// Solve for the pump interval that wins in exactly TARGET_MS:
//   total_gain = WIN_THRESHOLD + (TARGET_MS / DECAY_INTERVAL_MS) * DECAY_AMOUNT
//   num_pumps  = ceil(total_gain / PUMP_AMOUNT)
//   interval   = TARGET_MS / num_pumps
const TARGET_MS = 8000
const totalGain = WIN_THRESHOLD + (TARGET_MS / DECAY_INTERVAL_MS) * DECAY_AMOUNT
const numPumps  = Math.ceil(totalGain / PUMP_AMOUNT)
const INTERVAL_MS = Math.floor(TARGET_MS / numPumps)

export async function runStrategist(): Promise<AgentRunResult> {
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
  await submitScore('STRAT', pumps, timeMs, 'strategist')
  session.cleanup()

  return {
    name: 'strategist',
    passed: true,
    metrics: { pumps, timeMs, intervalMs: INTERVAL_MS, targetMs: TARGET_MS },
    lines: [`  won in ${(timeMs / 1000).toFixed(2)}s with ${pumps} pumps (target: ${TARGET_MS / 1000}s)`],
  }
}

if (process.argv[1].includes('strategist')) {
  runStrategist().then(r => { console.log(r.lines[0]); process.exit(0) })
}
