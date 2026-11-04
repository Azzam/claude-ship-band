// kind: a mode's name, built-in or one the person added (hooks/modes.ts).
export type Ask = { id: string; kind: string; title: string; detail: string }

// A step the person answered this session; `at` is when, in ms.
export type Done = { id: string; kind: string; title: string; answer: 'yes' | 'no'; at: number }

declare module 'claude-code' {
  interface PluginState {
    'ship-band': { asks: Shaped<Ask[]>; history: Shaped<Done[]> }
  }
}
