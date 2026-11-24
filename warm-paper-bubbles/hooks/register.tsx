import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Question } from '../types'

// 暖纸米白：浅米底 + 深棕字，对比约 10:1，远高于 3:1 下限。
// 只给气泡本身，colors 一个字段都不传，聊天区其余配色保持原样。
const LOOK: ThemeSetArgs = {
  style: {
    UserMessage: {
      backgroundColor: '#f7f2e7',
      color: '#3a3229',
      radius: 12,
      paddingX: 14,
      paddingY: 10,
      borderColor: '#e6dcc8',
      borderWidth: 1,
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

const short = (text: string, max = 56) => {
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

      if (!set.isDrawn) {
        $.ui.log(`气泡样式未生效：${set.reason}`, { to: 'debug' })
      }
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

  // 一轮结束后刷新，导航条跟着更新
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

    return { text: open ? '已收起提问列表。' : `已展开 ${list.length} 条提问，点一条跳过去。` }
  })

  // 滚到某条提问时，把游标跟过去，上一问/下一问从当前位置继续
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
    const jump = async (to: number) => {
      const target = list[Math.min(Math.max(0, to), list.length - 1)]

      if (target === undefined) return

      await update($, cursor, () => Math.min(Math.max(0, to), list.length - 1))
      const moved = await $.ui.scroll({ to: { requestId: target.uuid }, block: 'start' })

      if (moved.deny !== undefined) $.ui.toast(`没跳过去：${moved.deny}`)
    }

    // 展开时最多列 8 条，超出只显示游标附近
    const room = open ? Math.max(1, Math.min(8, e.props.maxRows - 2)) : 0
    const from = Math.max(0, Math.min(index - Math.floor(room / 2), list.length - room))
    const shown = list.slice(from, from + room)

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>提问 {index + 1}/{list.length} </Text>
          <Button key="prev" dimColor onPress={() => jump(index - 1)}>
            ‹ 上一问
          </Button>
          <Text> </Text>
          <Button key="next" dimColor onPress={() => jump(index + 1)}>
            下一问 ›
          </Button>
          <Text> </Text>
          <Button
            key="toggle"
            dimColor
            onPress={async () => {
              await update($, isExpanded, v => !v)
            }}
          >
            {open ? '收起' : '全部'}
          </Button>
        </Box>
        {open &&
          shown.map((q, i) => (
            <Box key={`row-${q.uuid}`}>
              <Text dimColor={from + i !== index}>{from + i === index ? '▸ ' : '  '}</Text>
              <Button key={q.uuid} dimColor={from + i !== index} onPress={() => jump(from + i)}>
                {q.text}
              </Button>
            </Box>
          ))}
      </Box>
    )
  })
}
