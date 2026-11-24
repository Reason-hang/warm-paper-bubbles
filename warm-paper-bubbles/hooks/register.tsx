import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Question } from '../types'

/**
 * 气泡：贴着你已发消息的观感——米白底、深棕字、小圆角、内边距收紧。
 * 只给 UserMessage 上色，colors 一个字段都不传，聊天区其余配色原样。
 */
const LOOK: ThemeSetArgs = {
  style: {
    UserMessage: {
      backgroundColor: '#f7f2e7',
      color: '#3a3229',
      radius: 8,
      paddingX: 12,
      paddingY: 6,
    },
  },
}

const questions = atom({ plugin: 'warm-paper-bubbles', key: 'questions' } as const, [], {
  shape: 'questions-3',
})
const cursor = atom({ plugin: 'warm-paper-bubbles', key: 'cursor' } as const, 0, { shape: 'cursor-1' })
const isExpanded = atom({ plugin: 'warm-paper-bubbles', key: 'isExpanded' } as const, false, {
  shape: 'expanded-1',
})

const short = (text: string, max = 44) => {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max)}…` : one
}

/**
 * 从 transcript 重读提问列表。
 *
 * 不挂在 session.append 上：内建的 cc-plugin-sec-default 在 prepend 层用
 * next.to 把该事件直接放行到更下层，user 层钩子收不到。
 */
const refresh = async ($: EngineInterface) => {
  const history = await $.session.messages({ last: 500 })

  if ('deny' in history) return

  const list: Question[] = history
    .filter(m => m.role === 'user' && m.uuid !== undefined && m.text.trim() !== '')
    .filter(m => (m.toolResults?.length ?? 0) === 0)
    .flatMap(m => (m.uuid === undefined ? [] : [{ uuid: m.uuid, text: short(m.text) }]))

  await update($, questions, () => list)
  await update($, cursor, i => Math.min(Math.max(0, i), Math.max(0, list.length - 1)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      const set = await $.theme.set(LOOK)

      if (!set.isDrawn) $.ui.log(`气泡样式未生效：${set.reason}`, { to: 'debug' })
    } catch (error) {
      $.ui.log(`气泡样式被拒：${String(error)}`, { to: 'debug' })
    }

    await refresh($)

    await $.command.register({
      name: 'my-questions',
      description: '展开/收起输入框上方的提问导航',
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await refresh($)

    return next(e)
  })

  on('command.run', { command: 'my-questions' }, async $ => {
    await refresh($)
    const list = await read($, questions)

    if (list.length === 0) return { text: '这一轮还没有你的提问。' }

    const open = await read($, isExpanded)
    await update($, isExpanded, () => !open)

    return { text: open ? '已收起提问列表。' : `已展开 ${list.length} 条提问。` }
  })

  // 滚到某条提问时把游标跟过去
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const onScreen = e.props.onScreen

    if (onScreen != null && onScreen.first === 0) {
      const list = await read($, questions)
      const index = list.findIndex(q => q.uuid === e.requestId)

      if (index >= 0) await update($, cursor, i => (i === index ? i : index))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, questions)

    if (list.length === 0 || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const index = Math.min(await read($, cursor), list.length - 1)
    const open = await read($, isExpanded)
    const current = list[index]

    /**
     * 桌面端 transcript 不接受程序化滚动（引擎回 transcript not scrollable
     * here），所以点一条是把它复制到剪贴板，不假装能跳。
     */
    const copy = async (to: number) => {
      const i = Math.min(Math.max(0, to), list.length - 1)
      const target = list[i]

      if (target === undefined) return

      await update($, cursor, () => i)
      const done = await $.ui.copy({ text: target.text, surface: e.surface })

      $.ui.toast(done.isCopied ? '已复制这条提问，可直接粘贴到搜索' : '复制失败')
    }

    const room = open ? Math.max(1, Math.min(6, e.props.maxRows - 1)) : 0
    const from = Math.max(0, Math.min(index - Math.floor(room / 2), list.length - room))
    const shown = list.slice(from, from + room)

    return (
      <Box flexDirection="column">
        <Box alignItems="center">
          <Text dimColor>
            {index + 1}/{list.length}
          </Text>
          <Text dimColor> </Text>
          <Button key="prev" plain hotkey="k" onPress={() => copy(index - 1)}>
            ‹
          </Button>
          <Text dimColor> </Text>
          <Button key="next" plain hotkey="j" onPress={() => copy(index + 1)}>
            ›
          </Button>
          <Text dimColor> </Text>
          <Button
            key="toggle"
            plain
            onPress={async () => {
              await update($, isExpanded, v => !v)
            }}
          >
            {open ? '⌃' : '⌄'}
          </Button>
          <Text dimColor> </Text>
          <Text dimColor>{current === undefined ? '' : current.text}</Text>
        </Box>
        {open &&
          shown.map((q, i) => (
            <Box key={`row-${q.uuid}`} alignItems="center">
              <Button key={q.uuid} plain dimColor={from + i !== index} onPress={() => copy(from + i)}>
                {from + i === index ? '▸' : ' '}
              </Button>
              <Text dimColor={from + i !== index}>{q.text}</Text>
            </Box>
          ))}
      </Box>
    )
  })
}
