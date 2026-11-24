import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'live-metrics',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

/** 测试自己充当引擎，把上下文水位推给插件。 */
const measure = async ($: any, on: any, tokens: number, window: number, percent: number) => {
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))

  await $.session.measure({
    context: { tokens, window, percent },
    rateLimits: [],
    changed: ['context'],
  })
}

const completeTurn = async ($: any, on: any, usage: Record<string, number>, durationMs: number) => {
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({
    answer: 'done',
    durationMs,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { ...usage, model: 'claude-opus-5' },
  })
}

test('没有指标时不占位', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('会话水位推来后显示上下文占比', async ($, on) => {
  await measure($, on, 22862, 256000, 9)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const row = await ui.find({ type: 'Text', text: /Ctx/ })

  expect(row?.text).toContain('23k')
  expect(row?.text).toContain('256k')
  expect(row?.text).toContain('9%')
  await ui.unmount()
})

test('一轮结束后胶囊出现速度与输出量', async ($, on) => {
  await completeTurn(
    $,
    on,
    {
      input_tokens: 45000,
      output_tokens: 776,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    8580,
  )

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const row = await ui.find({ type: 'Text', text: /tok\/s/ })

  expect(row?.text).toContain('Out 776')
  await ui.unmount()
})

test('展开后显示明细卡', async ($, on) => {
  await completeTurn(
    $,
    on,
    {
      input_tokens: 45,
      output_tokens: 800,
      cache_read_input_tokens: 32000,
      cache_creation_input_tokens: 0,
    },
    8600,
  )

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ plugin: 'live-metrics', key: 'toggle' })

  const card = await ui.find({ type: 'Text', text: /命中率/ })

  expect(card?.text).toContain('缓存读取 32k')
  await ui.unmount()
})

test('调查问卷占着时让位', async ($, on) => {
  await measure($, on, 1000, 256000, 1)

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'desktop',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ type: 'Text', text: /Ctx/ })).toBeUndefined()
  await ui.unmount()
})

test('会话启动时主动读一次水位', async ($, on) => {
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 12000, window: 256000, percent: 5 },
      rateLimits: [],
    },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const row = await ui.find({ type: 'Text', text: /Ctx/ })

  expect(row?.text).toContain('12k')
  await ui.unmount()
})
