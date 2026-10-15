import type { Register } from 'claude-code'

const THRESHOLD = 200_000
const BAR_WIDTH = 30

const k = (tokens: number) => `${Math.round(tokens / 1000)}k`

const bar = (tokens: number, window: number) => {
  const filled = Math.min(BAR_WIDTH, Math.round((tokens / window) * BAR_WIDTH))
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

export const register: Register = on => {
  let isCompacting = false

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Only the main loop; a subagent's turn or an interrupted one never triggers it.
    if (e.agentId || e.isAborted || isCompacting) return result

    const { context } = await $.session.usage()
    if ((context.tokens ?? 0) < THRESHOLD) return result

    // The turn is still closing here: compact a moment later, once the session is idle.
    $.clock.after(300, async () => {
      if (isCompacting) return
      isCompacting = true
      $.ui.status(`⏳ compactando (${k(context.tokens!)} tokens)…`)
      try {
        const compacted = await $.session.compact()
        if (compacted.skip) {
          $.ui.log(`auto-compact: omitido (${compacted.skip})`)
          return
        }
        const before = compacted.tokensBefore ?? context.tokens!
        const after = compacted.tokensAfter ?? (await $.session.usage()).context.tokens ?? 0
        const saved = Math.round((1 - after / before) * 100)
        $.ui.log(
          [
            `╭─ auto-compact (umbral ${k(THRESHOLD)}) ─────────────`,
            `│ antes   ${bar(before, context.window)}  ${k(before).padStart(5)}`,
            `│ después ${bar(after, context.window)}  ${k(after).padStart(5)}`,
            `╰─ −${k(before - after)} tokens (−${saved}%) · ventana ${k(context.window)}`,
          ].join('\n'),
        )
        $.ui.toast(`Compactado: ${k(before)} → ${k(after)}`)
      } catch {
        // A new turn started first (queued prompt): the next turn.complete tries again.
      } finally {
        isCompacting = false
        $.ui.status(undefined)
      }
    })

    return result
  })
}
