export type Question = {
  uuid: string
  text: string
}

declare module 'claude-code' {
  interface PluginState {
    'warm-paper-bubbles': {
      questions: Shaped<Question[]>
      cursor: Shaped<number>
      isExpanded: Shaped<boolean>
    }
  }
}
