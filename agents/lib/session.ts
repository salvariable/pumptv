import { io, Socket } from 'socket.io-client'

export const SERVER_URL = 'http://localhost:3000'

// Game constants mirrored from play screen
export const PUMP_AMOUNT = 3
export const DECAY_AMOUNT = 1
export const DECAY_INTERVAL_MS = 140
export const WIN_THRESHOLD = 100

export interface AgentSession {
  sessionId: string
  playSocket: Socket
  controllerSocket: Socket
  receivedPumps: () => number
  startGame: () => Promise<void>
  pump: (delayMs?: number) => void
  cleanup: () => void
}

function waitForEvent(socket: Socket, event: string): Promise<void> {
  return new Promise(resolve => socket.once(event, resolve))
}

function connect(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, { path: '/socket.io', reconnection: false })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

export async function createAgentSession(): Promise<AgentSession> {
  const playSocket = await connect(SERVER_URL)

  const sessionId = await new Promise<string>(resolve => {
    playSocket.emit('create-session', ({ sessionId }: { sessionId: string }) => resolve(sessionId))
  })

  const controllerSocket = await connect(SERVER_URL)

  await new Promise<void>((resolve, reject) => {
    playSocket.once('controller-connected', resolve)
    controllerSocket.emit('join-session', { sessionId }, (res: { ok?: boolean; error?: string }) => {
      if (res.error) reject(new Error(res.error))
    })
  })

  let _receivedPumps = 0
  playSocket.on('pump', () => _receivedPumps++)

  return {
    sessionId,
    playSocket,
    controllerSocket,
    receivedPumps: () => _receivedPumps,
    startGame: async () => {
      await new Promise<void>(resolve => {
        controllerSocket.once('game-started', resolve)
        controllerSocket.emit('game-start', { sessionId })
      })
    },
    pump: (delayMs = 0) => {
      if (delayMs > 0) {
        setTimeout(() => controllerSocket.emit('pump', { sessionId }), delayMs)
      } else {
        controllerSocket.emit('pump', { sessionId })
      }
    },
    cleanup: () => {
      playSocket.disconnect()
      controllerSocket.disconnect()
    },
  }
}

// Simulate balloon size given pumps received and elapsed time
export function simulateBalloon(pumps: number, elapsedMs: number): number {
  const decayTicks = Math.floor(elapsedMs / DECAY_INTERVAL_MS)
  return Math.max(0, Math.min(WIN_THRESHOLD, pumps * PUMP_AMOUNT - decayTicks * DECAY_AMOUNT))
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function fmt(label: string, value: string): string {
  return `  ${label.padEnd(18)} ${value}`
}
