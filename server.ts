import { createServer, IncomingMessage, ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server } from 'socket.io'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

interface Session {
  playSocketId: string | null
  controllerSocketId: string | null
  status: 'waiting' | 'connected'
}

const sessions = new Map<string, Session>()

function generateSessionId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function handleApiSession(res: ServerResponse) {
  let sessionId = generateSessionId()
  while (sessions.has(sessionId)) sessionId = generateSessionId()
  sessions.set(sessionId, { playSocketId: null, controllerSocketId: null, status: 'waiting' })
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify({ sessionId }))
}

app.prepare().then(() => {
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/api/session') {
      handleApiSession(res)
      return
    }
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  })

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
