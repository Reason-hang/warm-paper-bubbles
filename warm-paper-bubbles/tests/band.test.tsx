import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'warm-paper-bubbles',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

type Row = {
  role: 'user' | 'assistant'
  text: string
  uuid?: string
  toolResults?: { tool_use_id: string; text: string; isError?: boolean }[]
}

/** 测试自己充当引擎下层：记下落进 transcript 的行，并把它们交回给 mod。 */
const engine = (on: any) => {
  const rows: Row[] = []

  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'theme' } }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: rows }))

  return {
    say(text: string, uuid: string) {
      rows.push({ role: 'user', text, uuid })
    },
    toolResult(uuid: string) {
      rows.push({ role: 'user', text: '', uuid, toolResults: [{ tool_use_id: 't1', text: 'x' }] })
    },
  }
}

const boot = async ($: any) =>
  $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

test('没有提问时不占位', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  // 全放过 next 时图上没有本插件的东西
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('有提问时画出一行导航，含序号与三个按钮', async ($, on) => {
  const e = engine(on)
  e.say('第一条提问', 'msg-1')
  e.say('第二条提问', 'msg-2')
  await boot($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /提问 1\/2/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'prev' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'next' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeTruthy()
  await ui.unmount()
})

test('工具结果行不计入', async ($, on) => {
  const e = engine(on)
  e.say('真正的提问', 'msg-1')
  e.toolResult('msg-tool')
  await boot($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /提问 1\/1/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('调查问卷占着时让出这一行', async ($, on) => {
  const e = engine(on)
  e.say('提问', 'msg-1')
  await boot($)

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'desktop',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('展开后列出各条提问，按钮 key 就是消息 uuid', async ($, on) => {
  const e = engine(on)
  e.say('第一条提问', 'msg-1')
  e.say('第二条提问', 'msg-2')
  await boot($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ plugin: 'warm-paper-bubbles', key: 'toggle' })

  expect((await ui.find({ type: 'Button', key: 'msg-1' }))?.text).toBe('第一条提问')
  expect((await ui.find({ type: 'Button', key: 'msg-2' }))?.text).toBe('第二条提问')
  await ui.unmount()
})
