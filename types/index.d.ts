// kind: a mode's name, built-in or one the person added (hooks/modes.ts).
export type Ask = { id: string; kind: string; title: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    'ship-band': { asks: Shaped<Ask[]> }
  }
}
