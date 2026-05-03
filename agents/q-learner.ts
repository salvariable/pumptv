import { createAgentSession, simulateBalloon, submitScore, WIN_THRESHOLD, PUMP_AMOUNT, DECAY_INTERVAL_MS, AgentRunResult } from './lib/session.js'

// Q-Learning: learn pump interval through simulated trial and error.
// State = balloon bin (0-10), Actions = intervals in ms.
// After TRAIN_EPISODES, Q-table encodes which interval won fastest per state.

const ARMS       = [50, 100, 150, 200, 300]
const N_STATES   = 11
const ALPHA      = 0.15
const GAMMA      = 0.95
const TRAIN_EPS  = 600

function trainQTable(): number[][] {
  const Q: number[][] = Array.from({ length: N_STATES }, () => new Array(ARMS.length).fill(0))

  for (let ep = 0; ep < TRAIN_EPS; ep++) {
    const epsilon = Math.max(0.05, 1.0 - ep / (TRAIN_EPS * 0.8))
    let pumps = 0, elapsed = 0, balloon = 0

    while (balloon < WIN_THRESHOLD && elapsed < 60_000) {
      const state = Math.min(10, Math.floor(balloon / 10))

      const actionIdx = Math.random() < epsilon
        ? Math.floor(Math.random() * ARMS.length)
        : Q[state].indexOf(Math.max(...Q[state]))

      elapsed += ARMS[actionIdx]
      pumps++
      balloon = Math.max(0, Math.min(WIN_THRESHOLD, pumps * PUMP_AMOUNT - Math.floor(elapsed / DECAY_INTERVAL_MS)))

      const won      = balloon >= WIN_THRESHOLD
      const next     = Math.min(10, Math.floor(balloon / 10))
      const reward   = won ? 10_000 / elapsed : -0.1
      const maxNextQ = won ? 0 : Math.max(...Q[next])

      Q[state][actionIdx] += ALPHA * (reward + GAMMA * maxNextQ - Q[state][actionIdx])
    }
  }

  return Q
}

export async function runQLearner(): Promise<AgentRunResult> {
  const Q = trainQTable()

  const session = await createAgentSession()
  await session.startGame()

  const start = Date.now()
  const usedIntervals: number[] = []

  await new Promise<void>(resolve => {
    function step() {
      const elapsed  = Date.now() - start
      const balloonSize = simulateBalloon(session.receivedPumps(), elapsed)

      if (balloonSize >= WIN_THRESHOLD) { resolve(); return }

      const state      = Math.min(10, Math.floor(balloonSize / 10))
      const actionIdx  = Q[state].indexOf(Math.max(...Q[state]))
      const interval   = ARMS[actionIdx]
      usedIntervals.push(interval)

      session.pump()
      setTimeout(step, interval)
    }
    step()
  })

  const timeMs      = Date.now() - start
  const pumps       = session.receivedPumps()
  const avgInterval = Math.round(usedIntervals.reduce((a, b) => a + b, 0) / usedIntervals.length)

  await submitScore('QBOT', pumps, timeMs, 'q-learner')
  session.cleanup()

  return {
    name: 'q-learner',
    passed: true,
    metrics: { pumps, timeMs, avgInterval, trainEpisodes: TRAIN_EPS },
    lines: [`  won in ${(timeMs / 1000).toFixed(2)}s with ${pumps} pumps (avg interval: ${avgInterval}ms, trained ${TRAIN_EPS} eps)`],
  }
}

if (process.argv[1].includes('q-learner')) {
  runQLearner().then(r => { console.log(r.lines[0]); process.exit(0) })
}
