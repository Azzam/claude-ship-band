export type AskKind = 'commit' | 'deploy' | 'device'

export type Ask = { id: string; kind: AskKind; title: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    'ship-band': { asks: Shaped<Ask[]> }
  }
}
