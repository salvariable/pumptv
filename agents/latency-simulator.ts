/**
 * Latency Simulator
 * Pumps rapidly but each event is delayed 200ms before hitting the server.
 * Simulates a high-latency mobile connection (e.g. weak 4G).
 * Measures: can the game still be won? How many extra pumps are needed vs. zero-latency?
 */
import { createAgentSession, simulateBalloon, sleep, fmt, WIN_THRESHOLD, AgentRunResult } from './lib/session.js'

const SIMULATED_LATENCY_MS = 200
const PUMP_INTERVAL_MS = 80 // tap rate
const MAX_DURATION_MS = 30000

export async function runLatencySimulator(): Promise<AgentRunResult> {
  const session = await createAgentSession()
  await session.startGame()

  let won = false
  let sent = 0
  const start = Date.now()

  const pump = setInterval(() => {
    session.pump(SIMULATED_LATENCY_MS)
    sent++

    const elapsed = Date.now() - start
    const size = simulateBalloon(session.receivedPumps(), elapsed)
    if (size >= WIN_THRESHOLD) {
      won = true
      clearInterval(pump)
    }
  }, PUMP_INTERVAL_MS)

  const deadline = setTimeout(() => clearInterval(pump), MAX_DURATION_MS)
  await sleep(MAX_DURATION_MS + SIMULATED_LATENCY_MS + 200)
  clearTimeout(deadline)

  const elapsed = Date.now() - start
  const finalSize = simulateBalloon(session.receivedPumps(), elapsed - SIMULATED_LATENCY_MS)

  session.cleanup()

  const timeToWinSec = won ? Math.round(((elapsed - SIMULATED_LATENCY_MS) / 1000) * 10) / 10 : 0
  return {
    name: 'latency-simulator',
    passed: won,
    metrics: {
      won: won ? 1 : 0,
      timeToWinSec,
      sent,
      received: session.receivedPumps(),
      latencyMs: SIMULATED_LATENCY_MS,
    },
    lines: [
      fmt('simulated latency:', `${SIMULATED_LATENCY_MS}ms per event`),
      fmt('pump interval:', `${PUMP_INTERVAL_MS}ms`),
      fmt('pumps sent:', `${sent}`),
      fmt('pumps received:', `${session.receivedPumps()}`),
      fmt('game won:', won ? `yes ✓` : `no — balloon stuck at ${finalSize}% ✗`),
      fmt('time to win:', won ? `${((elapsed - SIMULATED_LATENCY_MS) / 1000).toFixed(1)}s` : 'n/a'),
    ],
  }
}

if (process.argv[1].includes('latency-simulator')) {
  runLatencySimulator().then(r => {
    console.log(`\n[${r.name}] ${r.passed ? '✓ passed' : '✗ failed'}`)
    r.lines.forEach(l => console.log(l))
    process.exit(0)
  })
}
