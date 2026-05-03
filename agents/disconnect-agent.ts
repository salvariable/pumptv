/**
 * Disconnect Agent
 * Connects as controller, pumps for 2s, then abruptly disconnects.
 * Reconnects a new controller to the SAME session (session stays alive on server).
 * Repeats 5 times.
 * Measures: does the server clean up state correctly on each disconnect/reconnect?
 */
import { io } from 'socket.io-client'
import { createAgentSession, SERVER_URL, sleep, fmt, AgentRunResult } from './lib/session.js'

const ROUNDS = 5
const PLAY_DURATION_MS = 2000

export async function runDisconnectAgent(): Promise<AgentRunResult> {
  const session = await createAgentSession()
  await session.startGame()

  const results: Array<{ reconnected: boolean; controllerDisconnectedReceived: boolean }> = []

  for (let i = 0; i < ROUNDS; i++) {
    // Pump for a bit
    const pump = setInterval(() => session.pump(), 100)
    await sleep(PLAY_DURATION_MS)
    clearInterval(pump)

    // Track if play socket got the disconnect event
    let gotDisconnect = false
    const disconnectPromise = new Promise<void>(resolve => {
      session.playSocket.once('controller-disconnected', () => {
        gotDisconnect = true
        resolve()
      })
      setTimeout(resolve, 1000) // timeout fallback
    })

    // Abruptly disconnect controller
    session.controllerSocket.disconnect()
    await disconnectPromise

    // Reconnect a fresh controller socket to the same session
    let reconnected = false
    try {
      const newController = io(SERVER_URL, { path: '/socket.io', reconnection: false })
      await new Promise<void>((resolve, reject) => {
        newController.once('connect', resolve)
        newController.once('connect_error', reject)
      })
      await new Promise<void>((resolve, reject) => {
        session.playSocket.once('controller-connected', resolve)
        newController.emit('join-session', { sessionId: session.sessionId }, (res: { ok?: boolean; error?: string }) => {
          if (res.error) reject(new Error(res.error))
        })
        setTimeout(() => reject(new Error('timeout')), 1000)
      })
      reconnected = true
      // Update internal controller socket reference for next round
      ;(session as { controllerSocket: typeof newController }).controllerSocket = newController
    } catch {
      reconnected = false
    }

    results.push({ reconnected, controllerDisconnectedReceived: gotDisconnect })
  }

  session.cleanup()

  const allPassed = results.every(r => r.reconnected && r.controllerDisconnectedReceived)
  const reconnects = results.filter(r => r.reconnected).length
  const disconnectEvents = results.filter(r => r.controllerDisconnectedReceived).length

  const successRate = Math.round((reconnects / ROUNDS) * 100)
  return {
    name: 'disconnect-agent',
    passed: allPassed,
    metrics: { rounds: ROUNDS, reconnects, disconnectEvents, successRate },
    lines: [
      fmt('rounds:', `${ROUNDS}`),
      fmt('reconnects:', `${reconnects}/${ROUNDS} ${reconnects === ROUNDS ? '✓' : '✗'}`),
      fmt('disconnect events:', `${disconnectEvents}/${ROUNDS} received by play ${disconnectEvents === ROUNDS ? '✓' : '✗'}`),
      fmt('session cleanup:', allPassed ? 'correct ✓' : 'issues found ✗'),
    ],
  }
}

if (process.argv[1].includes('disconnect-agent')) {
  runDisconnectAgent().then(r => {
    console.log(`\n[${r.name}] ${r.passed ? '✓ passed' : '✗ failed'}`)
    r.lines.forEach(l => console.log(l))
    process.exit(0)
  })
}
