import { runStressTester } from './stress-tester.js'
import { runBoundaryPlayer } from './boundary-player.js'
import { runDisconnectAgent } from './disconnect-agent.js'
import { runLatencySimulator } from './latency-simulator.js'
import { SERVER_URL, AgentRunResult } from './lib/session.js'

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const CYAN   = '\x1b[36m'
const YELLOW = '\x1b[33m'

const agents: Array<{ name: string; run: () => Promise<AgentRunResult> }> = [
  { name: 'stress-tester',     run: runStressTester },
  { name: 'boundary-player',   run: runBoundaryPlayer },
  { name: 'disconnect-agent',  run: runDisconnectAgent },
  { name: 'latency-simulator', run: runLatencySimulator },
]

async function reportToServer(result: AgentRunResult & { timestamp: number; durationMs: number }) {
  try {
    await fetch(`${SERVER_URL}/api/agent-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    })
  } catch {
    // server may not be running the dashboard endpoint yet, ignore
  }
}

async function main() {
  console.log()
  console.log(`${BOLD}${CYAN}┌──────────────────────────────────────────┐${RESET}`)
  console.log(`${BOLD}${CYAN}│       PUMP.TV — Agent Test Suite         │${RESET}`)
  console.log(`${BOLD}${CYAN}└──────────────────────────────────────────┘${RESET}`)
  console.log()

  const results: Array<AgentRunResult & { passed: boolean }> = []

  for (const agent of agents) {
    process.stdout.write(`  ${DIM}→${RESET} ${agent.name.padEnd(20)} running...\r`)
    const start = Date.now()
    try {
      const result = await agent.run()
      const durationMs = Date.now() - start
      const elapsed = (durationMs / 1000).toFixed(1)
      const icon = result.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
      console.log(`  ${icon} ${BOLD}${agent.name}${RESET}${' '.repeat(20 - agent.name.length)} ${DIM}${elapsed}s${RESET}`)
      result.lines.forEach(l => console.log(`  ${DIM}│${RESET}${l}`))
      console.log()
      results.push(result)
      await reportToServer({ ...result, timestamp: Date.now(), durationMs })
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(`  ${RED}✗${RESET} ${BOLD}${agent.name}${RESET} — ${RED}${(err as Error).message}${RESET} ${DIM}${elapsed}s${RESET}`)
      console.log()
      results.push({ name: agent.name, passed: false, lines: [], metrics: {} })
    }
  }

  const passed = results.filter(r => r.passed).length
  const total  = results.length

  console.log(`${CYAN}──────────────────────────────────────────────${RESET}`)
  if (passed === total) {
    console.log(`  ${GREEN}${BOLD}All ${total} agents passed${RESET}`)
  } else {
    console.log(`  ${YELLOW}${BOLD}${passed}/${total} agents passed${RESET}`)
    results.filter(r => !r.passed).forEach(r => console.log(`  ${RED}✗ ${r.name}${RESET}`))
  }
  console.log()

  process.exit(passed === total ? 0 : 1)
}

main().catch(err => {
  console.error(`${RED}Fatal:${RESET}`, err)
  process.exit(1)
})
