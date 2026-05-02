'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getSocket } from '@/lib/socket'

type Status = 'waiting-controller' | 'ready' | 'inflating' | 'success'

const MIN_PX = 80
const MAX_PX = 360
const WIN_THRESHOLD = 100
const DECAY_INTERVAL_MS = 140
const PUMP_AMOUNT = 3
const DECAY_AMOUNT = 1

function balloonPx(size: number): number {
  return MIN_PX + (size / WIN_THRESHOLD) * (MAX_PX - MIN_PX)
}

function balloonColor(size: number): string {
  const t = size / WIN_THRESHOLD
  if (t < 0.4) return `radial-gradient(circle at 35% 35%, #818cf8, #4f46e5)`
  if (t < 0.7) return `radial-gradient(circle at 35% 35%, #c084fc, #7c3aed)`
  if (t < 0.9) return `radial-gradient(circle at 35% 35%, #f472b6, #db2777)`
  return `radial-gradient(circle at 35% 35%, #fbbf24, #f59e0b)`
}

export default function PlayScreen() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [controllerUrl, setControllerUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('waiting-controller')
  const [balloon, setBalloon] = useState(0)
  const [pumps, setPumps] = useState(0)

  const balloonRef = useRef(0)
  const decayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusRef = useRef<Status>('waiting-controller')
  const sessionIdRef = useRef<string | null>(null)

  const updateStatus = (s: Status) => {
    statusRef.current = s
    setStatus(s)
  }

  const stopDecay = useCallback(() => {
    if (decayRef.current) { clearInterval(decayRef.current); decayRef.current = null }
  }, [])

  const startDecay = useCallback(() => {
    stopDecay()
    decayRef.current = setInterval(() => {
      const next = Math.max(0, balloonRef.current - DECAY_AMOUNT)
      balloonRef.current = next
      setBalloon(next)
    }, DECAY_INTERVAL_MS)
  }, [stopDecay])

  const handleSuccess = useCallback(() => {
    stopDecay()
    updateStatus('success')
    const socket = getSocket()
    if (sessionIdRef.current) socket.emit('game-over', { sessionId: sessionIdRef.current })
  }, [stopDecay])

  const startGame = useCallback(() => {
    balloonRef.current = 0
    setBalloon(0)
    setPumps(0)
    updateStatus('inflating')
    startDecay()
  }, [startDecay])

  const resetGame = useCallback(() => {
    stopDecay()
    balloonRef.current = 0
    setBalloon(0)
    setPumps(0)
    updateStatus('ready')
  }, [stopDecay])

  useEffect(() => {
    const socket = getSocket()

    socket.emit('create-session', ({ sessionId: sid }: { sessionId: string }) => {
      setSessionId(sid)
      sessionIdRef.current = sid
      setControllerUrl(`${window.location.origin}/controller/${sid}`)
    })

    socket.on('controller-connected', () => updateStatus('ready'))

    socket.on('controller-disconnected', () => {
      stopDecay()
      updateStatus('waiting-controller')
    })

    socket.on('game-start', () => startGame())

    socket.on('game-reset', () => resetGame())

    socket.on('pump', () => {
      if (statusRef.current !== 'inflating') return
      setPumps(p => p + 1)
      const next = Math.min(WIN_THRESHOLD, balloonRef.current + PUMP_AMOUNT)
      balloonRef.current = next
      setBalloon(next)
      if (next >= WIN_THRESHOLD) handleSuccess()
    })

    return () => {
      socket.off('controller-connected')
      socket.off('controller-disconnected')
      socket.off('game-start')
      socket.off('game-reset')
      socket.off('pump')
      stopDecay()
    }
  }, [stopDecay, handleSuccess, resetGame])

  const px = balloonPx(balloon)
  const pct = Math.round((balloon / WIN_THRESHOLD) * 100)

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>PUMP.TV</span>
        {status !== 'waiting-controller' && (
          <span style={styles.sessionBadge}>
            SESSION <strong>{sessionId}</strong>
          </span>
        )}
        {status === 'inflating' && (
          <span style={styles.statBadge}>{pumps} pumps</span>
        )}
      </div>

      {/* Main stage */}
      <div style={styles.stage}>

        {/* Waiting for controller */}
        {status === 'waiting-controller' && (
          <div style={styles.pairPanel}>
            <p style={styles.pairTitle}>Connect your phone to play</p>
            {controllerUrl ? (
              <>
                <div style={styles.qrWrap}>
                  <QRCodeSVG
                    value={controllerUrl}
                    size={200}
                    bgColor="transparent"
                    fgColor="#ffffff"
                    level="M"
                  />
                </div>
                <p style={styles.orLabel}>or enter manually</p>
                <div style={styles.codeBox}>
                  <span style={styles.codeText}>{sessionId}</span>
                </div>
                <p style={styles.hint}>
                  Go to <strong style={{ color: '#818cf8' }}>
                    {window?.location?.host}/controller/...
                  </strong>
                </p>
              </>
            ) : (
              <p style={styles.loading}>Generating session...</p>
            )}
          </div>
        )}

        {/* Ready (controller connected, waiting for controller to start) */}
        {status === 'ready' && (
          <div style={styles.readyPanel}>
            <div style={styles.connectedDot} />
            <p style={styles.connectedLabel}>Controller connected</p>
            <p style={styles.waitingHint}>Waiting for controller to start...</p>
          </div>
        )}

        {/* Inflating */}
        {status === 'inflating' && (
          <div style={styles.gameStage}>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${pct}%` }} />
            </div>
            <p style={styles.pctLabel}>{pct}%</p>
            <div style={styles.balloonWrap}>
              <div
                style={{
                  width: px,
                  height: px,
                  borderRadius: '50%',
                  background: balloonColor(balloon),
                  transition: 'all 80ms ease-out',
                  boxShadow: `0 0 ${20 + balloon * 0.5}px rgba(129,140,248,0.35)`,
                  position: 'relative',
                }}
              >
                {/* Highlight */}
                <div style={styles.balloonHighlight} />
              </div>
              {/* Tie */}
              <div style={{ ...styles.tie, opacity: balloon > 5 ? 1 : 0 }} />
            </div>
            <p style={styles.tapHint}>Keep pumping!</p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div style={styles.successPanel}>
            <div style={styles.floatingBalloon}>
              <div
                style={{
                  width: MAX_PX,
                  height: MAX_PX,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 35%, #fbbf24, #f59e0b)`,
                  boxShadow: '0 0 80px rgba(251,191,36,0.5)',
                  animation: 'float-up 2s ease-in-out infinite',
                  position: 'relative',
                }}
              >
                <div style={styles.balloonHighlight} />
              </div>
              <div style={styles.tie} />
              <div style={styles.tieString} />
            </div>
            <p style={styles.successTitle}>PERFECT INFLATION!</p>
            <p style={styles.successSub}>{pumps} pumps</p>
            <p style={styles.waitingHint}>Play again from your phone</p>
          </div>
        )}
      </div>

      {/* Architecture callout */}
      <div style={styles.archBar}>
        <span style={styles.archItem}>
          <span style={dotStyle('green')} /> TV / Desktop
        </span>
        <span style={styles.archDivider}>→ WebSocket relay →</span>
        <span style={styles.archItem}>
          <span style={dotStyle(status !== 'waiting-controller' ? 'green' : 'red')} />
          {' '}Mobile Controller {status === 'waiting-controller' ? '(disconnected)' : '(connected)'}
        </span>
      </div>
    </div>
  )
}

function dotStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color === 'green' ? '#4ade80' : '#ef4444',
    boxShadow: color === 'green' ? '0 0 6px #4ade80' : '0 0 6px #ef4444',
  }
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#080810',
    color: '#fff',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: 3,
    color: '#818cf8',
    flexShrink: 0,
  },
  sessionBadge: {
    fontSize: 12,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.4)',
    background: 'rgba(255,255,255,0.05)',
    padding: '4px 12px',
    borderRadius: 20,
  },
  statBadge: {
    fontSize: 12,
    letterSpacing: 1,
    color: '#818cf8',
    marginLeft: 'auto',
  },
  stage: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // --- Pair panel ---
  pairPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    animation: 'fade-in 0.4s ease',
  },
  pairTitle: {
    fontSize: 24,
    fontWeight: 300,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  qrWrap: {
    padding: 20,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
  },
  orLabel: { fontSize: 13, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 },
  codeBox: {
    padding: '10px 32px',
    background: 'rgba(129,140,248,0.1)',
    border: '1px solid rgba(129,140,248,0.3)',
    borderRadius: 8,
  },
  codeText: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: 8,
    color: '#818cf8',
    fontFamily: 'monospace',
  },
  hint: { fontSize: 13, color: 'rgba(255,255,255,0.35)' },
  loading: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  // --- Ready panel ---
  readyPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
    animation: 'fade-in 0.3s ease',
  },
  connectedDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#4ade80',
    boxShadow: '0 0 12px #4ade80',
    animation: 'pulse-glow 2s infinite',
  },
  connectedLabel: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
  waitingHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1,
  },
  // --- Game stage ---
  gameStage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 600,
    padding: '0 32px',
  },
  progressBar: {
    width: '100%',
    height: 6,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #818cf8, #f472b6)',
    borderRadius: 3,
    transition: 'width 80ms ease-out',
  },
  pctLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2,
  },
  balloonWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: MAX_PX + 40,
    justifyContent: 'flex-end',
  },
  balloonHighlight: {
    position: 'absolute',
    top: '15%',
    left: '20%',
    width: '30%',
    height: '25%',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.25)',
    filter: 'blur(4px)',
  },
  tie: {
    width: 14,
    height: 10,
    background: 'rgba(255,255,255,0.6)',
    borderRadius: '0 0 6px 6px',
    transition: 'opacity 0.3s',
  },
  tieString: {
    width: 2,
    height: 60,
    background: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
  },
  tapHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  // --- Success panel ---
  successPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    animation: 'fade-in 0.5s ease',
  },
  floatingBalloon: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
  },
  successTitle: {
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: 4,
    color: '#fbbf24',
    textShadow: '0 0 40px rgba(251,191,36,0.5)',
    marginTop: 24,
  },
  successSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  playAgainBtn: {
    marginTop: 8,
    padding: '14px 48px',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 3,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    color: '#fff',
    cursor: 'pointer',
  },
  // --- Architecture bar ---
  archBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: '12px 32px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
  },
  archItem: { display: 'flex', alignItems: 'center', gap: 6 },
  archDivider: { color: 'rgba(255,255,255,0.15)' },
}
