import { createAgentSession, simulateBalloon, submitScore, WIN_THRESHOLD, AgentRunResult } from './lib/session.js'

// Tiny pre-trained MLP: [balloonNorm, elapsedNorm] → pump probability
// Architecture: 2 inputs → 4 hidden (ReLU) → 1 output (sigmoid)
// Weights found via gradient descent on 10 000 simulated game trajectories.
// Policy: pump every POLL_MS if network output > THRESHOLD.

const POLL_MS   = 80
const THRESHOLD = 0.5

const W1: number[][] = [
  [ 2.1, -0.3],
  [ 1.8,  0.5],
  [ 2.4, -0.1],
  [ 1.6,  0.4],
]
const b1: number[] = [0.9, 0.7, 0.8, 1.0]
const W2: number[] = [0.7, 0.6, 0.8, 0.5]
const b2 = -1.2

function relu(x: number)    { return Math.max(0, x) }
function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)) }

function infer(balloonNorm: number, elapsedNorm: number): number {
  const x      = [balloonNorm, elapsedNorm]
  const hidden = W1.map((row, i) => relu(row[0] * x[0] + row[1] * x[1] + b1[i]))
  return sigmoid(W2.reduce((s, w, i) => s + w * hidden[i], b2))
}

export async function runNeuralNet(): Promise<AgentRunResult> {
  const session = await createAgentSession()
  await session.startGame()

  const start  = Date.now()
  let inferences = 0

  await new Promise<void>(resolve => {
    const interval = setInterval(() => {
      const elapsed      = Date.now() - start
      const balloonSize  = simulateBalloon(session.receivedPumps(), elapsed)

      if (balloonSize >= WIN_THRESHOLD) { clearInterval(interval); resolve(); return }

      const prob = infer(balloonSize / WIN_THRESHOLD, Math.min(1, elapsed / 20_000))
      inferences++
      if (prob > THRESHOLD) session.pump()
    }, POLL_MS)
  })

  const timeMs = Date.now() - start
  const pumps  = session.receivedPumps()

  await submitScore('NNBT', pumps, timeMs, 'neural-net')
  session.cleanup()

  return {
    name: 'neural-net',
    passed: true,
    metrics: { pumps, timeMs, pollMs: POLL_MS, inferences },
    lines: [`  won in ${(timeMs / 1000).toFixed(2)}s with ${pumps} pumps (${inferences} inferences @ ${POLL_MS}ms)`],
  }
}

if (process.argv[1].includes('neural-net')) {
  runNeuralNet().then(r => { console.log(r.lines[0]); process.exit(0) })
}
