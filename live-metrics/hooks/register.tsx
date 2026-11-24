import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Metrics } from '../types'

const EMPTY: Metrics = {
  tps: null,
  ttftMs: null,
  durationMs: null,
  outTokens: 0,
  contextTokens: null,
  contextWindow: null,
  contextPercent: null,
  freshInput: 0,
  cachedInput: 0,
  isWorking: false,
  isOpen: false,
}

const metrics = atom({ plugin: 'live-metrics', key: 'metrics' } as const, EMPTY, {
  shape: 'metrics-1',
})

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))
const secs = (ms: number) => `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`

export const register: Register = on => {
  // 会话一开始先读一次水位：measure 事件未必在第一轮之前推来，
  // 只有它保证这一行在你还没提问时就有东西可看。
  on('session.start', async ($, e, next) => {
    try {
      const usage = await $.session.usage()
      const { context } = usage

      await update($, metrics, m => ({
        ...m,
        contextTokens: context.tokens ?? m.contextTokens,
        contextWindow: context.window,
        contextPercent: context.percent ?? m.contextPercent,
      }))
    } catch (error) {
      // 读不到就等 measure 推送，不让整个会话启动因此失败
      $.ui.log(`初值读取失败：${String(error)}`, { to: 'debug' })
    }

    return next(e)
  })

  // 每步开始：清掉上一轮的结算值，只保留上下文水位
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    await update($, metrics, m => ({
      ...m,
      tps: null,
      ttftMs: null,
      durationMs: null,
      outTokens: 0,
      freshInput: 0,
      cachedInput: 0,
      isWorking: true,
    }))

    return next(e)
  })

  /**
   * 流式计时。钩子的预算只算自己的代码，等 chunk 的时间不计入，
   * 所以每次读钟都落在真实的时间点上。
   */
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      yield* next(e)

      return undefined
    }

    const stream = next(e)
    const startedAt = await $.clock.now()
    let firstAt: number | null = null
    let lastAt = startedAt

    for await (const chunk of stream) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'tool') {
        lastAt = await $.clock.now()

        if (firstAt === null) firstAt = lastAt
      }

      if (chunk.kind === 'stop' && chunk.usage !== null) {
        const usage = chunk.usage
        const elapsedMs = Math.max(1, lastAt - startedAt)
        const ttft = firstAt === null ? null : firstAt - startedAt
        const tps = usage.output_tokens > 0 ? usage.output_tokens / (elapsedMs / 1000) : null

        // 流式写：吞掉失败。这一行是显示用，写不进状态不该中断对话。
        try {
          await update($, metrics, m => ({
            ...m,
            tps,
            ttftMs: ttft,
            outTokens: m.outTokens + usage.output_tokens,
            freshInput: m.freshInput + usage.input_tokens + usage.cache_creation_input_tokens,
            cachedInput: m.cachedInput + usage.cache_read_input_tokens,
          }))
        } catch {
          // 保持上一次的显示
        }
      }

      yield chunk
    }

    return await stream.result
  })

  // 一轮结束：端到端耗时与总额
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    await update($, metrics, m => ({
      ...m,
      isWorking: false,
      durationMs: e.durationMs,
      outTokens: e.usage?.output_tokens ?? m.outTokens,
      freshInput:
        e.usage === undefined
          ? m.freshInput
          : e.usage.input_tokens + e.usage.cache_creation_input_tokens,
      cachedInput: e.usage?.cache_read_input_tokens ?? m.cachedInput,
      tps:
        e.usage === undefined || e.durationMs <= 0
          ? m.tps
          : e.usage.output_tokens / (e.durationMs / 1000),
    }))

    return next(e)
  })

  // 引擎自己会推上下文水位，不必轮询
  on('session.measure', async ($, e, next) => {
    const { context } = e

    await update($, metrics, m => ({
      ...m,
      contextTokens: context.tokens ?? m.contextTokens,
      contextWindow: context.window,
      contextPercent: context.percent ?? m.contextPercent,
    }))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // 调查问卷占着这一行时让位
    if (e.props.hasSurvey) return next(e)

    const m = await read($, metrics)
    const hasAny = m.tps !== null || m.contextTokens !== null || m.outTokens > 0

    if (!hasAny) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const parts: string[] = []

    if (m.tps !== null) parts.push(`${Math.round(m.tps)} tok/s`)
    if (m.ttftMs !== null) parts.push(`TTFT ${secs(m.ttftMs)}`)
    if (m.contextTokens !== null && m.contextWindow !== null) {
      const pct = m.contextPercent ?? (m.contextTokens / m.contextWindow) * 100
      parts.push(`Ctx ${k(m.contextTokens)}/${k(m.contextWindow)} (${Math.round(pct)}%)`)
    }
    if (m.outTokens > 0) parts.push(`Out ${k(m.outTokens)}`)

    const totalIn = m.freshInput + m.cachedInput
    const hitRate = totalIn > 0 ? (m.cachedInput / totalIn) * 100 : 0
    const windowLeft =
      m.contextWindow !== null && m.contextTokens !== null
        ? m.contextWindow - m.contextTokens
        : null

    return (
      <Box flexDirection="column">
        <Box key="pill" alignItems="center">
          <Text dimColor size="footnote">
            {m.isWorking ? '◐ ' : ''}
            {parts.join(' · ')}
          </Text>
          <Text dimColor> </Text>
          <Button
            key="toggle"
            plain
            hotkey="m"
            onPress={async () => {
              await update($, metrics, v => ({ ...v, isOpen: !v.isOpen }))
            }}
          >
            {m.isOpen ? '▾' : '▸'}
          </Button>
        </Box>
        {m.isOpen && (
          <Box key="card" flexDirection="column" paddingX={1} marginTop={1}>
            <Text dimColor size="footnote">
              响应耗时 {m.durationMs === null ? '—' : secs(m.durationMs)} · 本步输出 {k(m.outTokens)}
            </Text>
            <Text dimColor size="footnote">
              输入 新增 {k(m.freshInput)} + 缓存读取 {k(m.cachedInput)} · 命中率{' '}
              {hitRate.toFixed(1)}%
            </Text>
            <Text dimColor size="footnote">
              上下文 {m.contextTokens === null ? '—' : k(m.contextTokens)} /{' '}
              {m.contextWindow === null ? '—' : k(m.contextWindow)}
              {windowLeft === null ? '' : ` · 距压缩阈值 ${k(windowLeft)}`}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
