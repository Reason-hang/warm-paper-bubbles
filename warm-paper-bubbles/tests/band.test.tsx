import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'warm-paper-bubbles',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
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

  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('有提问时画出一行导航，含序号与三个控件', async ($, on) => {
  const e = engine(on)
  e.say('第一条提问', 'msg-1')
  e.say('第二条提问', 'msg-2')
  await boot($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /1\/2/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'prev' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'next' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeTruthy()
  // 当前这条的摘要就画在行内，一眼能看出停在哪
  expect((await ui.find({ type: 'Text', text: /第一条提问/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('工具结果行不计入', async ($, on) => {
  const e = engine(on)
  e.say('真正的提问', 'msg-1')
  e.toolResult('msg-tool')
  await boot($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /1\/1/ }))?.text).toBeTruthy()
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

  expect(await ui.find({ type: 'Button', key: 'msg-1' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'msg-2' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /第二条提问/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('点一条会把那条提问复制走', async ($, on) => {
  const e = engine(on)
  const copied: string[] = []
  on('ui.copy', (_$, ev) => {
    copied.push(ev.text)

    return { value: { isCopied: true } }
  })
  e.say('要被复制的问题', 'msg-1')
  await boot($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ plugin: 'warm-paper-bubbles', key: 'prev' })

  expect(copied).toEqual(['要被复制的问题'])
  await ui.unmount()
})
