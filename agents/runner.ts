import { runSpeedDemon }   from './speed-demon.js'
import { runAverageHuman } from './average-human.js'
import { runStrategist }   from './strategist.js'
import { runSurvivor }     from './survivor.js'
import { runQLearner }     from './q-learner.js'
import { runBandit }       from './bandit.js'
import { runNeuralNet }    from './neural-net.js'
import { SERVER_URL, AgentRunResult } from './lib/session.js'

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const CYAN   = '\x1b[36m'

const agents: Array<{ name: string; run: () => Promise<AgentRunResult> }> = [
  { name: 'speed-demon',   run: runSpeedDemon },
  { name: 'average-human', run: runAverageHuman },
  { name: 'strategist',    run: runStrategist },
  { name: 'survivor',      run: runSurvivor },
  { name: 'q-learner',     run: runQLearner },
  { name: 'bandit',        run: runBandit },
  { name: 'neural-net',    run: runNeuralNet },
]

async function reportToServer(result: AgentRunResult & { timestamp: number; durationMs: number }) {
  try {
    await fetch(`${SERVER_URL}/api/agent-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    })
  } catch { /* ignore */ }
}

async function main() {
  console.log()
  console.log(`${BOLD}${CYAN}┌──────────────────────────────────────────┐${RESET}`)
  console.log(`${BOLD}${CYAN}│       PUMP.TV — Player Agents            │${RESET}`)
  console.log(`${BOLD}${CYAN}└──────────────────────────────────────────┘${RESET}`)
  console.log()

  for (const agent of agents) {
    process.stdout.write(`  ${DIM}→${RESET} ${agent.name.padEnd(20)} running...\r`)
    const start = Date.now()
    try {
      const result = await agent.run()
      const durationMs = Date.now() - start
      console.log(`  ${GREEN}✓${RESET} ${BOLD}${agent.name}${RESET}${' '.repeat(20 - agent.name.length)} ${DIM}${(durationMs / 1000).toFixed(1)}s${RESET}`)
      result.lines.forEach(l => console.log(`  ${DIM}│${RESET}${l}`))
      console.log()
      await reportToServer({ ...result, timestamp: Date.now(), durationMs })
    } catch (err) {
      console.log(`  ${RED}✗${RESET} ${BOLD}${agent.name}${RESET} — ${RED}${(err as Error).message}${RESET}`)
      console.log()
    }
  }

  console.log(`${CYAN}──────────────────────────────────────────────${RESET}`)
  console.log(`  ${GREEN}${BOLD}All agents played — check /dashboard${RESET}`)
  console.log()
  process.exit(0)
}

main().catch(err => {
  console.error(`${RED}Fatal:${RESET}`, err)
  process.exit(1)
})
