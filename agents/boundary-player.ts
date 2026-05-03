/**
 * Boundary Player
 * Pumps at the theoretical equilibrium rate (~every 420ms) where gain = loss.
 * Measures: does the balloon actually stay stable, or does timing drift cause it to fill/deflate?
 *
 * Math: decay = 1 unit / 140ms. Each pump = +3 units.
 * To net 0: 1 pump per (3 * 140ms) = 1 pump / 420ms.
 */
import { createAgentSession, simulateBalloon, sleep, fmt, DECAY_INTERVAL_MS, PUMP_AMOUNT, AgentRunResult } from './lib/session.js'

const EQUILIBRIUM_MS = DECAY_INTERVAL_MS * PUMP_AMOUNT // 420ms
const DURATION_MS = 20000

export async function runBoundaryPlayer(): Promise<AgentRunResult> {
  const session = await createAgentSession()
  await session.startGame()

  const snapshots: number[] = []
  let sent = 0
  const start = Date.now()

  const pump = setInterval(() => {
    session.pump()
    sent++
    const elapsed = Date.now() - start
    const size = simulateBalloon(session.receivedPumps(), elapsed)
    snapshots.push(size)
  }, EQUILIBRIUM_MS)

  await sleep(DURATION_MS)
  clearInterval(pump)

  const elapsed = Date.now() - start
  const finalSize = simulateBalloon(session.receivedPumps(), elapsed)
  const avg = snapshots.reduce((a, b) => a + b, 0) / snapshots.length
  const min = Math.min(...snapshots)
  const max = Math.max(...snapshots)
  const drift = max - min

  session.cleanup()

  return {
    name: 'boundary-player',
    passed: drift < 20,
    metrics: { drift, avgBalloon: Math.round(avg * 10) / 10, minBalloon: min, maxBalloon: max, snapshots: snapshots.length },
    lines: [
      fmt('pump interval:', `${EQUILIBRIUM_MS}ms (theoretical equilibrium)`),
      fmt('snapshots:', `${snapshots.length} taken`),
      fmt('balloon avg:', `${avg.toFixed(1)}%`),
      fmt('balloon min/max:', `${min}% / ${max}%`),
      fmt('drift:', `${drift} units — ${drift < 20 ? 'stable ✓' : 'unstable ✗'}`),
      fmt('final size:', `${finalSize}%`),
    ],
  }
}

if (process.argv[1].includes('boundary-player')) {
  runBoundaryPlayer().then(r => {
    console.log(`\n[${r.name}] ${r.passed ? '✓ passed' : '✗ failed'}`)
    r.lines.forEach(l => console.log(l))
    process.exit(0)
  })
}
