'use client'
import { use, useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'

type ControllerStatus = 'joining' | 'waiting-start' | 'playing' | 'finished' | 'disconnected' | 'error'

export default function ControllerScreen({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [status, setStatus] = useState<ControllerStatus>('joining')
  const [pumps, setPumps] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [isPressed, setIsPressed] = useState(false)
  const sessionRef = useRef(sessionId)

  useEffect(() => {
    const socket = getSocket()

    socket.emit('join-session', { sessionId }, (res: { ok?: boolean; error?: string }) => {
      if (res.error) {
        setErrorMsg(res.error)
        setStatus('error')
      } else {
        setStatus('waiting-start')
      }
    })

    socket.on('game-started', () => {
      setPumps(0)
      setStatus('playing')
    })

    socket.on('game-over', () => setStatus('finished'))

    socket.on('game-reset', () => {
      setPumps(0)
      setStatus('waiting-start')
    })

    socket.on('play-disconnected', () => setStatus('disconnected'))

    return () => {
      socket.off('game-started')
      socket.off('game-over')
      socket.off('game-reset')
      socket.off('play-disconnected')
    }
  }, [sessionId])

  function sendPump() {
    if (status !== 'playing') return
    const socket = getSocket()
    socket.emit('pump', { sessionId: sessionRef.current })
    setPumps(p => p + 1)
    setIsPressed(true)
    setTimeout(() => setIsPressed(false), 120)

    if (navigator.vibrate) navigator.vibrate(30)
  }

  return (
    <div style={styles.root}>
      {/* Status bar */}
      <div style={styles.topBar}>
        <span style={styles.logo}>PUMP.TV</span>
        <span style={styles.sessionCode}>{sessionId}</span>
      </div>

      {/* Main content */}
      <div style={styles.content}>

        {status === 'joining' && (
          <div style={styles.centeredMessage}>
            <div style={styles.spinner} />
            <p style={styles.messageText}>Connecting...</p>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.centeredMessage}>
            <p style={{ ...styles.messageText, color: '#ef4444' }}>Error</p>
            <p style={styles.subText}>{errorMsg}</p>
          </div>
        )}

        {status === 'waiting-start' && (
          <div style={styles.centeredMessage}>
            <div style={styles.pulsingDot} />
            <p style={styles.messageText}>Ready!</p>
            <button
              style={styles.startBtn}
              onPointerDown={() => {
                const socket = getSocket()
                socket.emit('game-start', { sessionId })
              }}
            >
              START
            </button>
          </div>
        )}

        {status === 'finished' && (
          <div style={styles.centeredMessage}>
            <p style={{ ...styles.messageText, fontSize: 48 }}>🎈</p>
            <p style={styles.messageText}>Nice!</p>
            <p style={styles.subText}>Waiting for host to restart...</p>
          </div>
        )}

        {status === 'disconnected' && (
          <div style={styles.centeredMessage}>
            <p style={{ ...styles.messageText, color: '#ef4444' }}>Disconnected</p>
            <p style={styles.subText}>The host closed the session.</p>
          </div>
        )}

        {status === 'playing' && (
          <div style={styles.playArea}>
            <p style={styles.pumpCount}>
              <span style={styles.pumpNumber}>{pumps}</span>
              <span style={styles.pumpLabel}>pumps</span>
            </p>

            <button
              style={{
                ...styles.pumpBtn,
                transform: isPressed ? 'scale(0.93)' : 'scale(1)',
                boxShadow: isPressed
                  ? '0 0 20px rgba(99,102,241,0.3)'
                  : '0 0 60px rgba(99,102,241,0.5), 0 20px 60px rgba(0,0,0,0.5)',
                background: isPressed
                  ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                  : 'linear-gradient(135deg, #818cf8, #6366f1)',
              }}
              onPointerDown={sendPump}
              onContextMenu={e => e.preventDefault()}
            >
              PUMP
            </button>

            <p style={styles.tapHint}>TAP FAST</p>
          </div>
        )}
      </div>
    </div>
  )
}

const PUMP_BTN_SIZE = 240

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    background: '#080810',
    color: '#fff',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'manipulation',
    overscrollBehavior: 'none',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  logo: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 3,
    color: '#818cf8',
  },
  sessionCode: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.04)',
    padding: '4px 10px',
    borderRadius: 6,
  },
  content: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredMessage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: 32,
    animation: 'fade-in 0.3s ease',
  },
  messageText: {
    fontSize: 24,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.8)',
  },
  subText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center' as const,
    maxWidth: 240,
    lineHeight: 1.6,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid rgba(255,255,255,0.08)',
    borderTop: '3px solid #818cf8',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  pulsingDot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#4ade80',
    boxShadow: '0 0 16px #4ade80',
    animation: 'pulse-glow 1.5s ease-in-out infinite',
  },
  startBtn: {
    padding: '20px 64px',
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 4,
    background: 'linear-gradient(135deg, #818cf8, #6366f1)',
    border: 'none',
    borderRadius: 16,
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 0 40px rgba(99,102,241,0.45)',
    WebkitTapHighlightColor: 'transparent',
  },
  playArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
    width: '100%',
    animation: 'fade-in 0.3s ease',
  },
  pumpCount: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  pumpNumber: {
    fontSize: 56,
    fontWeight: 900,
    color: '#818cf8',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'monospace',
  },
  pumpLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
  },
  pumpBtn: {
    width: PUMP_BTN_SIZE,
    height: PUMP_BTN_SIZE,
    borderRadius: '50%',
    border: 'none',
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: 4,
    color: '#fff',
    cursor: 'pointer',
    transition: 'transform 80ms ease, box-shadow 80ms ease, background 80ms ease',
    WebkitTapHighlightColor: 'transparent',
  },
  tapHint: {
    fontSize: 11,
    letterSpacing: 4,
    color: 'rgba(255,255,255,0.2)',
    textTransform: 'uppercase' as const,
  },
}
