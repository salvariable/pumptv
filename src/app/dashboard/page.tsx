'use client'
import { useEffect, useState, useCallback } from 'react'

interface StoredResult {
  name: string
  passed: boolean
  lines: string[]
  metrics: Record<string, number>
  timestamp: number
  durationMs: number
}

interface AgentData {
  name: string
  lastRun: StoredResult | null
  record: StoredResult | null
  history: StoredResult[]
}

interface DashboardData {
  status: 'idle' | 'running'
  agents: AgentData[]
}

const AGENT_META: Record<string, {
  label: string
  description: string
  recordLabel: (m: Record<string, number>) => string
  primaryMetric: (m: Record<string, number>) => string
  secondaryMetrics: (m: Record<string, number>) => string[]
}> = {
  'stress-tester': {
    label: 'Stress Tester',
    description: '~100 pump events/sec for 5 seconds',
    recordLabel: m => `${m.ratePPS} evt/s`,
    primaryMetric: m => `${m.ratePPS} evt/s`,
    secondaryMetrics: m => [
      `${m.sent} sent / ${m.received} received`,
      `${m.drops === 0 ? '0 drops' : `${m.drops} drops`}`,
    ],
  },
  'boundary-player': {
    label: 'Boundary Player',
    description: 'Pumps at theoretical equilibrium (420ms)',
    recordLabel: m => `${m.drift} drift`,
    primaryMetric: m => `drift ${m.drift} units`,
    secondaryMetrics: m => [
      `balloon avg ${m.avgBalloon}%`,
      `${m.snapshots} snapshots`,
    ],
  },
  'disconnect-agent': {
    label: 'Disconnect Agent',
    description: '5 abrupt disconnects + reconnects',
    recordLabel: m => `${m.successRate}% success`,
    primaryMetric: m => `${m.reconnects}/${m.rounds} reconnects`,
    secondaryMetrics: m => [
      `${m.disconnectEvents}/${m.rounds} disconnect events`,
      `${m.successRate}% success rate`,
    ],
  },
  'latency-simulator': {
    label: 'Latency Simulator',
    description: '200ms artificial latency per pump',
    recordLabel: m => m.won ? `won in ${m.timeToWinSec}s` : 'not won',
    primaryMetric: m => m.won ? `won in ${m.timeToWinSec}s` : 'did not win',
    secondaryMetrics: m => [
      `${m.sent} sent / ${m.received} received`,
      `${m.latencyMs}ms simulated latency`,
    ],
  },
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

function AgentCard({ agent, isRunning }: { agent: AgentData; isRunning: boolean }) {
  const meta = AGENT_META[agent.name]
  const last = agent.lastRun
  const rec  = agent.record

  const statusColor = !last ? '#444' : last.passed ? '#4ade80' : '#ef4444'
  const statusLabel = !last ? 'no data' : last.passed ? 'passed' : 'failed'

  return (
    <div style={card}>
      {/* Card header */}
      <div style={cardHeader}>
        <div>
          <p style={cardTitle}>{meta.label}</p>
          <p style={cardDesc}>{meta.description}</p>
        </div>
        <span style={{ ...statusBadge, background: statusColor + '22', color: statusColor, borderColor: statusColor + '44' }}>
          {isRunning && !last ? '...' : statusLabel}
        </span>
      </div>

      {/* Primary metric */}
      <div style={metricBlock}>
        {last ? (
          <>
            <p style={metricPrimary}>{meta.primaryMetric(last.metrics)}</p>
            {meta.secondaryMetrics(last.metrics).map((m, i) => (
              <p key={i} style={metricSecondary}>{m}</p>
            ))}
          </>
        ) : (
          <p style={metricPrimary}>—</p>
        )}
      </div>

      {/* Record row */}
      <div style={recordRow}>
        <span style={recordIcon}>🏆</span>
        <span style={recordLabel}>
          {rec ? `${meta.recordLabel(rec.metrics)}` : 'no record yet'}
        </span>
        {last && (
          <span style={timestamp}>{timeAgo(last.timestamp)}</span>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-results')
      if (res.ok) setData(await res.json())
    } catch { /* server not ready yet */ }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, data?.status === 'running' ? 3000 : 10000)
    return () => clearInterval(interval)
  }, [fetchData, data?.status])

  async function runTests() {
    if (triggering || data?.status === 'running') return
    setTriggering(true)
    setError(null)
    try {
      const res = await fetch('/api/run-agents', { method: 'POST' })
      if (res.status === 409) { setError('Already running'); return }
      await fetchData()
    } catch {
      setError('Could not reach server')
    } finally {
      setTriggering(false)
    }
  }

  const isRunning = data?.status === 'running' || triggering

  return (
    <div style={root}>
      {/* Header */}
      <div style={header}>
        <div>
          <span style={logo}>PUMP.TV</span>
          <span style={path}>/dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isRunning && <span style={runningBadge}>running...</span>}
          {error && <span style={errorText}>{error}</span>}
          <button
            style={{ ...runBtn, opacity: isRunning ? 0.5 : 1 }}
            onClick={runTests}
            disabled={isRunning}
          >
            {isRunning ? 'Running...' : 'Run Tests'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={grid}>
        {data ? (
          data.agents.map(agent => (
            <AgentCard key={agent.name} agent={agent} isRunning={isRunning} />
          ))
        ) : (
          AGENT_META && Object.keys(AGENT_META).map(name => (
            <AgentCard
              key={name}
              agent={{ name, lastRun: null, record: null, history: [] }}
              isRunning={false}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={footer}>
        <span style={footerText}>
          Server is a pure relay — agents connect as play + controller sockets and test the full stack
        </span>
        <a href="/play" style={footerLink}>← Back to game</a>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const root: React.CSSProperties = {
  minHeight: '100vh',
  background: '#080810',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 32px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
}

const logo: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 3,
  color: '#818cf8',
}

const path: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.25)',
  marginLeft: 12,
  letterSpacing: 1,
}

const runBtn: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 2,
  background: 'linear-gradient(135deg, #818cf8, #6366f1)',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  cursor: 'pointer',
  textTransform: 'uppercase',
}

const runningBadge: React.CSSProperties = {
  fontSize: 12,
  color: '#fbbf24',
  letterSpacing: 1,
  animation: 'pulse-glow 1.5s ease-in-out infinite',
}

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: '#ef4444',
}

const grid: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 1,
  padding: 32,
  maxWidth: 1000,
  margin: '0 auto',
  width: '100%',
  alignContent: 'start',
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const cardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const cardTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: 'rgba(255,255,255,0.9)',
}

const cardDesc: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.3)',
  marginTop: 3,
  letterSpacing: 0.5,
}

const statusBadge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '3px 10px',
  borderRadius: 20,
  border: '1px solid',
  flexShrink: 0,
}

const metricBlock: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const metricPrimary: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: '#818cf8',
  letterSpacing: -0.5,
  fontVariantNumeric: 'tabular-nums',
}

const metricSecondary: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.35)',
  letterSpacing: 0.5,
}

const recordRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  paddingTop: 12,
  borderTop: '1px solid rgba(255,255,255,0.05)',
}

const recordIcon: React.CSSProperties = {
  fontSize: 14,
}

const recordLabel: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.5)',
  flex: 1,
  letterSpacing: 0.5,
}

const timestamp: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.2)',
  letterSpacing: 0.5,
}

const footer: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 32px',
  borderTop: '1px solid rgba(255,255,255,0.05)',
  flexShrink: 0,
}

const footerText: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.2)',
  letterSpacing: 0.5,
}

const footerLink: React.CSSProperties = {
  fontSize: 12,
  color: '#818cf8',
  textDecoration: 'none',
  letterSpacing: 1,
}
