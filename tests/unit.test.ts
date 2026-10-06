import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { checkAudioConfig, runLogicChecks } from '../src/preflight/suite.ts'

test('local safety checks pass', () => {
  const results = runLogicChecks()
  for (const result of results) assert.equal(result.status, 'pass', `${result.id}: ${result.detail}`)
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  assert.match(css, /\.broadcast-stage \.scoreboard[\s\S]*top: 270px/)
  assert.match(css, /\.broadcast-stage \.join-instruction[\s\S]*top: 430px/)
  assert.match(css, /\.broadcast-stage \.power-menu[\s\S]*top: 500px/)
  assert.match(css, /\.safe-top \{ top: 0; height: 260px; \}/)
  assert.match(css, /\.safe-bottom \{ top: 1250px; height: 670px; \}/)
  assert.deepEqual(checkAudioConfig(), [])
  const checks = Object.fromEntries(results.map((result) => [result.id, result.status]))
  const details = Object.fromEntries(results.map((result) => [result.id, result.detail]))
  writeFileSync(
    new URL('../public/preflight-report.json', import.meta.url),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), checks, details, liveSafe: false }, null, 2)}\n`,
  )
})
