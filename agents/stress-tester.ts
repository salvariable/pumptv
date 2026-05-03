/**
 * Stress Tester
 * Pumps at ~100 events/sec for 5 seconds.
 * Measures: events sent vs received by play socket — any drops indicate server-side loss.
 */
import { createAgentSession, sleep, fmt } from './lib/session.js'

export async function runStressTester() {
  const session = await createAgentSession()
  await session.startGame()

  const DURATION_MS = 5000
  const INTERVAL_MS = 10
  let sent = 0
  const start = Date.now()

  const interval = setInterval(() => {
    session.pump()
    sent++
  }, INTERVAL_MS)

  await sleep(DURATION_MS)
  clearInterval(interval)
  await sleep(100) // let in-flight events arrive

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const received = session.receivedPumps()
  const drops = sent - received
  const dropPct = ((drops / sent) * 100).toFixed(1)

  session.cleanup()

  return {
    name: 'stress-tester',
    passed: drops === 0,
    lines: [
      fmt('sent:', `${sent} events`),
      fmt('received:', `${received} events`),
      fmt('drops:', drops === 0 ? '0 ✓' : `${drops} (${dropPct}%) ✗`),
      fmt('duration:', `${elapsed}s`),
      fmt('rate:', `${(sent / (DURATION_MS / 1000)).toFixed(0)} events/sec`),
    ],
  }
}

if (process.argv[1].includes('stress-tester')) {
  runStressTester().then(r => {
    console.log(`\n[${r.name}] ${r.passed ? '✓ passed' : '✗ failed'}`)
    r.lines.forEach(l => console.log(l))
    process.exit(0)
  })
}
