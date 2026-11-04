// kind: a mode's name, built-in or one the person added (hooks/modes.ts).
// answer: set once the person pressed Yes or No; the row then shows a report.
export type Ask = { id: string; kind: string; title: string; detail: string; answer?: 'yes' | 'no' }

declare module 'claude-code' {
  interface PluginState {
    'ship-band': { asks: Shaped<Ask[]> }
  }
}
