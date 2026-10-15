import { expect, mock, test } from 'claude-code/testing'

const turn = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'completed' } as const

const setup = (on: Parameters<Parameters<typeof test>[1] & ((...a: never[]) => unknown)>[1], tokens: number) => {
  const state = { compacts: 0, logs: [] as string[] }
  on('turn.complete', () => ({ text: 'ok' }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens, window: 1_000_000, percent: tokens / 10_000 } } }))
  on('session.compact', () => (state.compacts++, { messages: [{ role: 'user', text: 'summary', toolUses: [] }], tokensBefore: tokens, tokensAfter: 30_000 }))
  on('ui.log', (_$, e) => (state.logs.push(e.text), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  return state
}

test('compacts after the turn once past 200k and shows before and after', async ($, on) => {
  const clock = mock.clock(on)
  const state = setup(on as never, 250_000)
  await $.turn.complete(turn as never)
  expect(state.compacts).toBe(0)
  await clock.advance(500)
  expect(state.compacts).toBe(1)
  expect(state.logs.join('\n')).toContain('250k')
  expect(state.logs.join('\n')).toContain('30k')
})

test('leaves the context alone under 200k', async ($, on) => {
  const clock = mock.clock(on)
  const state = setup(on as never, 150_000)
  await $.turn.complete(turn as never)
  await clock.advance(500)
  expect(state.compacts).toBe(0)
})

test('ignores subagent turns', async ($, on) => {
  const clock = mock.clock(on)
  const state = setup(on as never, 250_000)
  await $.turn.complete({ ...turn, agentId: 'a1' } as never)
  await clock.advance(500)
  expect(state.compacts).toBe(0)
})
