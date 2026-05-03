import { createServer, IncomingMessage, ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server } from 'socket.io'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// ─── Session store ────────────────────────────────────────────────────────────

interface Session {
  playSocketId: string | null
  controllerSocketId: string | null
  status: 'waiting' | 'connected'
}

const sessions = new Map<string, Session>()

function generateSessionId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ─── Agent result store ───────────────────────────────────────────────────────

interface StoredResult {
  name: string
  passed: boolean
  lines: string[]
  metrics: Record<string, number>
  timestamp: number
  durationMs: number
}

const AGENT_NAMES = ['stress-tester', 'boundary-player', 'disconnect-agent', 'latency-simulator']
const agentHistory = new Map<string, StoredResult[]>(AGENT_NAMES.map(n => [n, []]))
const agentRecords = new Map<string, StoredResult>()
let runStatus: 'idle' | 'running' = 'idle'

function isBetter(existing: StoredResult | undefined, next: StoredResult): boolean {
  if (!existing) return next.passed
  if (!next.passed) return false
  const m = next.metrics
  const e = existing.metrics
  switch (next.name) {
    case 'stress-tester':    return m.drops === 0 && m.ratePPS > (e.ratePPS ?? 0)
    case 'boundary-player':  return m.drift < (e.drift ?? Infinity)
    case 'disconnect-agent': return m.successRate > (e.successRate ?? 0)
    case 'latency-simulator':
      if (!m.won) return false
      if (!e.won) return true
      return m.timeToWinSec < e.timeToWinSec
    default: return false
  }
}

function storeResult(result: StoredResult) {
  const history = agentHistory.get(result.name) ?? []
  history.push(result)
  if (history.length > 20) history.shift()
  agentHistory.set(result.name, history)
  if (isBetter(agentRecords.get(result.name), result)) {
    agentRecords.set(result.name, result)
  }
}

async function runAgentsBackground() {
  if (runStatus === 'running') return
  runStatus = 'running'
  try {
    const { runStressTester }    = await import('./agents/stress-tester.js')
    const { runBoundaryPlayer }  = await import('./agents/boundary-player.js')
    const { runDisconnectAgent } = await import('./agents/disconnect-agent.js')
    const { runLatencySimulator }= await import('./agents/latency-simulator.js')

    for (const run of [runStressTester, runBoundaryPlayer, runDisconnectAgent, runLatencySimulator]) {
      const start = Date.now()
      const result = await run()
      storeResult({ ...result, timestamp: Date.now(), durationMs: Date.now() - start })
    }
  } catch (err) {
    console.error('[agents] run failed:', err)
  } finally {
    runStatus = 'idle'
  }
}

// ─── HTTP API handlers ────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => resolve(body))
  })
}

function handleApiSession(res: ServerResponse) {
  let sessionId = generateSessionId()
  while (sessions.has(sessionId)) sessionId = generateSessionId()
  sessions.set(sessionId, { playSocketId: null, controllerSocketId: null, status: 'waiting' })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ sessionId }))
}

function handleGetAgentResults(res: ServerResponse) {
  const data = {
    status: runStatus,
    agents: AGENT_NAMES.map(name => ({
      name,
      lastRun: agentHistory.get(name)?.at(-1) ?? null,
      record:  agentRecords.get(name) ?? null,
      history: agentHistory.get(name) ?? [],
    })),
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function handlePostAgentResults(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req)
  try {
    storeResult(JSON.parse(body) as StoredResult)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  } catch {
    res.writeHead(400)
    res.end()
  }
}

function handleRunAgents(res: ServerResponse) {
  if (runStatus === 'running') {
    res.writeHead(409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Already running' }))
    return
  }
  res.writeHead(202, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
  runAgentsBackground()
}

// ─── App bootstrap ────────────────────────────────────────────────────────────

app.prepare().then(() => {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const { method, url } = req
    if (method === 'POST' && url === '/api/session')           { handleApiSession(res); return }
    if (method === 'GET'  && url === '/api/agent-results')     { handleGetAgentResults(res); return }
    if (method === 'POST' && url === '/api/agent-results')     { await handlePostAgentResults(req, res); return }
    if (method === 'POST' && url === '/api/run-agents')        { handleRunAgents(res); return }
    handle(req, res, parse(url!, true))
  })

  const io = new Server(httpServer, { cors: { origin: '*' }, path: '/socket.io' })

  io.on('connection', (socket) => {
    socket.on('create-session', (callback: (data: { sessionId: string }) => void) => {
      let sessionId = generateSessionId()
      while (sessions.has(sessionId)) sessionId = generateSessionId()
      sessions.set(sessionId, { playSocketId: socket.id, controllerSocketId: null, status: 'waiting' })
      callback({ sessionId })
    })

    socket.on('claim-session', (data: { sessionId: string }, callback: (data: { ok?: boolean; error?: string }) => void) => {
      const session = sessions.get(data.sessionId)
      if (!session) { callback({ error: 'Session not found' }); return }
      if (session.playSocketId) { callback({ error: 'Session already has a play screen' }); return }
      session.playSocketId = socket.id
      callback({ ok: true })
    })

    socket.on('join-session', (data: { sessionId: string }, callback: (data: { ok?: boolean; error?: string }) => void) => {
      const session = sessions.get(data.sessionId)
      if (!session) { callback({ error: 'Session not found' }); return }
      if (session.controllerSocketId) { callback({ error: 'Session already has a controller' }); return }
      session.controllerSocketId = socket.id
      session.status = 'connected'
      if (session.playSocketId) io.to(session.playSocketId).emit('controller-connected')
      callback({ ok: true })
    })

    socket.on('pump', (data: { sessionId: string }) => {
      const session = sessions.get(data.sessionId)
      if (!session || session.controllerSocketId !== socket.id) return
      if (session.playSocketId) io.to(session.playSocketId).emit('pump')
    })

    socket.on('game-start', (data: { sessionId: string }) => {
      const session = sessions.get(data.sessionId)
      if (!session || session.controllerSocketId !== socket.id) return
      if (session.playSocketId) io.to(session.playSocketId).emit('game-start')
      socket.emit('game-started')
    })

    socket.on('game-over', (data: { sessionId: string }) => {
      const session = sessions.get(data.sessionId)
      if (!session || session.playSocketId !== socket.id) return
      if (session.controllerSocketId) io.to(session.controllerSocketId).emit('game-over')
    })

    socket.on('game-reset', (data: { sessionId: string }) => {
      const session = sessions.get(data.sessionId)
      if (!session || session.controllerSocketId !== socket.id) return
      if (session.playSocketId) io.to(session.playSocketId).emit('game-reset')
    })

    socket.on('disconnect', () => {
      for (const [sessionId, session] of sessions.entries()) {
        if (session.controllerSocketId === socket.id) {
          session.controllerSocketId = null
          session.status = 'waiting'
          if (session.playSocketId) io.to(session.playSocketId).emit('controller-disconnected')
        }
        if (session.playSocketId === socket.id) {
          if (session.controllerSocketId) io.to(session.controllerSocketId).emit('play-disconnected')
          sessions.delete(sessionId)
        }
      }
    })
  })

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
