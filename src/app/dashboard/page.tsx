'use client'
import { useEffect, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Score {
  name: string
  pumps: number
  timeMs: number
  type: 'human' | 'agent'
  agentId?: string
  timestamp: number
}

interface AgentResult {
  name: string
  lastRun: { metrics: Record<string, number>; timestamp: number } | null
  record:  { metrics: Record<string, number> } | null
}

interface DashboardState {
  scores: Score[]
  agentStatus: 'idle' | 'running'
  agents: AgentResult[]
}

// ─── Agent catalogue ──────────────────────────────────────────────────────────

const CATALOGUE = [
  {
    id: 'speed-demon',
    tag: 'SPEED',
    icon: '⚡',
    color: '#fbbf24',
    fullName: 'Speed Demon',
    objective: 'Win as fast as physically possible.',
    strategy: 'Pumps every 10ms — the minimum the Node.js event loop allows. Fills the balloon before decay is even a factor.',
    techCategory: 'Scripted Agent',
    techIsAI: false,
    techDetail: 'A setInterval(10ms) fires unconditionally. No observation of game state, no branching, no policy. It would become a Reinforcement Learning agent if it received balloon size as an observation and adapted its rate based on a reward signal.',
  },
  {
    id: 'average-human',
    tag: 'HUMAN',
    icon: '🧑',
    color: '#4ade80',
    fullName: 'Average Human',
    objective: 'Simulate the natural rhythm of a casual mobile player.',
    strategy: 'Pumps every 200ms — derived from empirical research showing 4–6 taps/sec for casual touchscreen users.',
    techCategory: 'Scripted Agent',
    techIsAI: false,
    techDetail: 'Still a fixed setInterval(200ms). The constant comes from tap rate data, not from learning. A realistic simulation would sample from a Gaussian distribution to model human timing variance — this one doesn\'t.',
  },
  {
    id: 'strategist',
    tag: 'STRAT',
    icon: '🧮',
    color: '#60a5fa',
    fullName: 'Strategist',
    objective: 'Win in exactly 8 seconds — no faster, no slower.',
    strategy: 'Solves the balloon\'s gain/loss equation analytically and executes the result blindly.',
    techCategory: 'Mathematical Model',
    techIsAI: false,
    techDetail: 'The interval is derived once before the game: total_gain = WIN_THRESHOLD + (TARGET_MS / DECAY_INTERVAL) × DECAY; interval = TARGET_MS / ⌈total_gain / PUMP_AMOUNT⌉. Still deterministic — it has no feedback loop and cannot adapt if events are dropped.',
  },
  {
    id: 'survivor',
    tag: 'SURV',
    icon: '🐢',
    color: '#f97316',
    fullName: 'Survivor',
    objective: 'Win using the minimum viable effort.',
    strategy: 'Pumps just above the equilibrium point where gain = loss, converging to 100% in ~35 seconds.',
    techCategory: 'Game Theory',
    techIsAI: false,
    techDetail: 'Exploits the fixed point: at pump_interval = DECAY_INTERVAL × PUMP_AMOUNT (420ms), net_gain = 0. Pumping at 300ms yields +0.86 units/cycle — the slowest positive convergence. No AI needed; this is mathematical exploitation of the reward structure.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const RANK_COLORS = ['#fbbf24', '#94a3b8', '#cd7f32']

// ─── Components ───────────────────────────────────────────────────────────────

function Leaderboard({ scores }: { scores: Score[] }) {
  if (scores.length === 0) {
    return (
      <div style={emptyBoard}>
        <p style={emptyText}>NO SCORES YET</p>
        <p style={emptyHint}>Run agents or play a game to populate the board</p>
      </div>
    )
  }

  return (
    <table style={table}>
      <thead>
        <tr>
          {['#', 'NAME', 'TIME', 'PUMPS', 'TYPE'].map(h => (
            <th key={h} style={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {scores.map((s, i) => {
          const rankColor = RANK_COLORS[i] ?? 'rgba(255,255,255,0.4)'
          const cat = s.type === 'agent'
            ? CATALOGUE.find(c => c.id === s.agentId)
            : null
          return (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ ...td, color: rankColor, fontWeight: 900, width: 40 }}>
                {i + 1 <= 3 ? ['🥇','🥈','🥉'][i] : `#${i + 1}`}
              </td>
              <td style={{ ...td, fontWeight: 800, letterSpacing: 3, color: cat ? cat.color : '#fff' }}>
                {s.name}
              </td>
              <td style={{ ...td, color: 'rgba(255,255,255,0.8)' }}>
                {formatTime(s.timeMs)}
              </td>
              <td style={{ ...td, color: 'rgba(255,255,255,0.5)' }}>
                {s.pumps}
              </td>
              <td style={td}>
                <span style={{
                  fontSize: 10,
                  letterSpacing: 1,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: s.type === 'agent' ? 'rgba(129,140,248,0.15)' : 'rgba(74,222,128,0.12)',
                  color: s.type === 'agent' ? '#818cf8' : '#4ade80',
                  border: `1px solid ${s.type === 'agent' ? 'rgba(129,140,248,0.3)' : 'rgba(74,222,128,0.25)'}`,
                }}>
                  {s.type === 'agent' ? '🤖 agent' : '👤 human'}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function AgentCard({ agent, lastRun }: { agent: typeof CATALOGUE[number]; lastRun: AgentResult | null }) {
  const last = lastRun?.lastRun
  return (
    <div style={{ ...agentCard, borderColor: agent.color + '30' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{agent.icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ ...agentName, color: agent.color }}>{agent.fullName}</p>
          <p style={agentObjective}>{agent.objective}</p>
        </div>
        {last && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>{timeAgo(last.timestamp)}</span>
        )}
      </div>

      {/* Strategy */}
      <p style={agentStrategy}>{agent.strategy}</p>

      {/* Tech box */}
      <div style={techBox}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...techBadge, background: agent.color + '18', color: agent.color, borderColor: agent.color + '40' }}>
            {agent.techIsAI ? 'AI' : 'NOT AI'}
          </span>
          <span style={techCategory}>{agent.techCategory}</span>
        </div>
        <p style={techDetail}>{agent.techDetail}</p>
      </div>

      {/* Best score */}
      {last && (
        <p style={agentBest}>
          Last run: <strong>{formatTime(last.metrics.timeMs)}</strong> · {last.metrics.pumps} pumps
        </p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [state, setState] = useState<DashboardState>({ scores: [], agentStatus: 'idle', agents: [] })
  const [triggering, setTriggering] = useState(false)
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)

  const fetchAll = useCallback(async () => {
    const [scoresRes, agentsRes] = await Promise.all([
      fetch('/api/scores').catch(() => null),
      fetch('/api/agent-results').catch(() => null),
    ])
    const scores = scoresRes?.ok ? await scoresRes.json() : []
    const agentsData = agentsRes?.ok ? await agentsRes.json() : { status: 'idle', agents: [] }
    setState({ scores, agentStatus: agentsData.status, agents: agentsData.agents ?? [] })
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, state.agentStatus === 'running' ? 3000 : 10000)
    return () => clearInterval(interval)
  }, [fetchAll, state.agentStatus])

  async function runAgents() {
    if (triggering || state.agentStatus === 'running') return
    setTriggering(true)
    setRunStartedAt(Date.now())
    try {
      await fetch('/api/run-agents', { method: 'POST' })
      await fetchAll()
    } finally {
      setTriggering(false)
    }
  }

  const isRunning = state.agentStatus === 'running' || triggering
  const completed = runStartedAt
    ? state.agents.filter(a => a.lastRun && a.lastRun.timestamp > runStartedAt).length
    : 0
  const progressPct = isRunning ? (completed / 4) * 100 : (state.scores.length > 0 ? 100 : 0)

  return (
    <div style={root}>
      {/* Header */}
      <div style={header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={logo}>PUMP.TV</span>
          <span style={pathLabel}>/dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isRunning && <span style={runningLabel}>running agents...</span>}
          <button style={{ ...runBtn, opacity: isRunning ? 0.5 : 1 }} onClick={runAgents} disabled={isRunning}>
            {isRunning ? 'Running...' : 'Run Agents'}
          </button>
        </div>
      </div>

      <div style={body}>
        {/* Leaderboard */}
        <section style={section}>
          <div style={sectionHeader}>
            <p style={sectionTitle}>HIGH SCORES</p>
            <p style={sectionSub}>Sorted by time — fastest wins. Agents and humans compete on the same board.</p>
          </div>
          <Leaderboard scores={state.scores} />
        </section>

        {/* Divider */}
        <div style={divider} />

        {/* Agent catalogue */}
        <section style={section}>
          <div style={sectionHeader}>
            <p style={sectionTitle}>AGENTS</p>
            <p style={sectionSub}>Four scripted players, each with a different strategy. None of them are AI.</p>
          </div>
          <div style={agentGrid}>
            {CATALOGUE.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                lastRun={state.agents.find(a => a.name === agent.id) ?? null}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Progress bar */}
      <div style={progressTrack}>
        <div style={{
          height: '100%',
          width: `${progressPct}%`,
          background: isRunning
            ? 'linear-gradient(90deg, #818cf8, #a78bfa, #818cf8)'
            : 'rgba(129,140,248,0.25)',
          backgroundSize: '200% 100%',
          borderRadius: 2,
          transition: isRunning ? 'width 1.2s ease' : 'width 0.4s ease',
          animation: isRunning ? 'progress-shimmer 1.8s linear infinite' : undefined,
        }} />
      </div>

      {/* Footer */}
      <div style={footer}>
        <span style={footerText}>
          Server is a pure Socket.IO relay — agents connect as play + controller pairs
        </span>
        <a href="/play" style={footerLink}>← Back to game</a>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const root: React.CSSProperties = { minHeight: '100vh', background: '#080810', color: '#fff', display: 'flex', flexDirection: 'column' }
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }
const logo: React.CSSProperties = { fontSize: 18, fontWeight: 800, letterSpacing: 3, color: '#818cf8' }
const pathLabel: React.CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }
const runBtn: React.CSSProperties = { padding: '8px 20px', fontSize: 12, fontWeight: 700, letterSpacing: 2, background: 'linear-gradient(135deg, #818cf8, #6366f1)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', textTransform: 'uppercase' }
const runningLabel: React.CSSProperties = { fontSize: 12, color: '#fbbf24', letterSpacing: 1 }
const body: React.CSSProperties = { flex: 1, maxWidth: 1000, margin: '0 auto', width: '100%', padding: '32px 32px 0' }
const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20 }
const sectionHeader: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }
const sectionSub: React.CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,0.4)' }
const divider: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.05)', margin: '32px 0' }

// Leaderboard
const emptyBoard: React.CSSProperties = { padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }
const emptyText: React.CSSProperties = { fontSize: 14, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.15)' }
const emptyHint: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.2)', letterSpacing: 0.5 }
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.25)', padding: '0 12px 12px 0', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)' }
const td: React.CSSProperties = { padding: '14px 12px 14px 0', fontSize: 14 }

// Agent cards
const agentGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }
const agentCard: React.CSSProperties = { background: 'rgba(255,255,255,0.025)', border: '1px solid', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }
const agentName: React.CSSProperties = { fontSize: 16, fontWeight: 800, letterSpacing: 1, lineHeight: 1 }
const agentObjective: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3, lineHeight: 1.5 }
const agentStrategy: React.CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }
const techBox: React.CSSProperties = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 14 }
const techBadge: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: 1.5, padding: '2px 8px', borderRadius: 4, border: '1px solid', flexShrink: 0 }
const techCategory: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }
const techDetail: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, fontFamily: 'monospace' }
const agentBest: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.3)', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }

// Progress + footer
const progressTrack: React.CSSProperties = { height: 3, background: 'rgba(255,255,255,0.04)', flexShrink: 0, marginTop: 32 }
const footer: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 32px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }
const footerText: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: 0.5 }
const footerLink: React.CSSProperties = { fontSize: 12, color: '#818cf8', textDecoration: 'none', letterSpacing: 1 }
