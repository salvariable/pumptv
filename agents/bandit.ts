import { createAgentSession, simulateBalloon, submitScore, WIN_THRESHOLD, PUMP_AMOUNT, DECAY_INTERVAL_MS, DECAY_AMOUNT, AgentRunResult } from './lib/session.js'

// Epsilon-Greedy Multi-Armed Bandit: explore N arms (pump intervals),
// pick the one with the lowest average completion time, then exploit it.

const ARMS            = [75, 120, 160, 200, 280, 400] // ms
const EXPLORE_ROUNDS  = 40  // simulated games per arm

function exploreBestArm() {
  const stats = ARMS.map(interval => {
    let wins = 0, totalTime = 0

    for (let ep = 0; ep < EXPLORE_ROUNDS; ep++) {
      let pumps = 0, elapsed = 0, balloon = 0

      while (balloon < WIN_THRESHOLD && elapsed < 60_000) {
        elapsed  += interval
        pumps++
        balloon  = Math.max(0, Math.min(WIN_THRESHOLD,
          pumps * PUMP_AMOUNT - Math.floor(elapsed / DECAY_INTERVAL_MS) * DECAY_AMOUNT))
      }

      if (balloon >= WIN_THRESHOLD) { wins++; totalTime += elapsed }
    }

    return { interval, wins, avgMs: wins > 0 ? totalTime / wins : Infinity }
  })

  return stats.reduce((best, arm) =>
    arm.wins > 0 && arm.avgMs < best.avgMs ? arm : best
  )
}

export async function runBandit(): Promise<AgentRunResult> {
  const best = exploreBestArm()

  const session = await createAgentSession()
  await session.startGame()

  const start = Date.now()

  await new Promise<void>(resolve => {
    const interval = setInterval(() => {
      session.pump()
      const size = simulateBalloon(session.receivedPumps(), Date.now() - start)
      if (size >= WIN_THRESHOLD) { clearInterval(interval); resolve() }
    }, best.interval)
  })

  const timeMs = Date.now() - start
  const pumps  = session.receivedPumps()

  await submitScore('BNDT', pumps, timeMs, 'bandit')
  session.cleanup()

  return {
    name: 'bandit',
    passed: true,
    metrics: { pumps, timeMs, chosenInterval: best.interval, armsExplored: ARMS.length, roundsPerArm: EXPLORE_ROUNDS },
    lines: [`  won in ${(timeMs / 1000).toFixed(2)}s with ${pumps} pumps (arm: ${best.interval}ms after ${ARMS.length * EXPLORE_ROUNDS} sims)`],
  }
}

if (process.argv[1].includes('bandit')) {
  runBandit().then(r => { console.log(r.lines[0]); process.exit(0) })
}
