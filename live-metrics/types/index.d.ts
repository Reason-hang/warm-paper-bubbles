/** 一轮对话的实时指标，画在输入框上方那一行。 */
export type Metrics = {
  /** 生成速度，tok/s；尚未产生输出时为 null */
  tps: number | null
  /** 首字延迟，毫秒；还没吐第一个字时为 null */
  ttftMs: number | null
  /** 本轮实际耗时，毫秒；未结束时为 null */
  durationMs: number | null
  /** 本轮输出 token 数 */
  outTokens: number
  /** 当前上下文占用，token */
  contextTokens: number | null
  /** 当前模型的上下文窗口 */
  contextWindow: number | null
  /** 上下文占比，0-100 */
  contextPercent: number | null
  /** 本轮输入：未缓存的 + 写入缓存的 */
  freshInput: number
  /** 本轮从提示缓存读到的输入 */
  cachedInput: number
  /** 本轮是否还在生成 */
  isWorking: boolean
  /** 明细卡是否展开 */
  isOpen: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'live-metrics': { metrics: Shaped<Metrics> }
  }
}
