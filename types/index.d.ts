// kind: a mode's name, built-in or one the person added (hooks/modes.ts).
export type Ask = { id: string; kind: string; title: string; detail: string }

// A step of this session. answer: yes/no from the panel, or ran (Claude ran it
// without asking). at: ms, 0 when only the transcript knows it (no time there).
// ranId: the command that carried out an approved step. scanned: rebuilt from
// the transcript, so never saved.
export type Done = {
  id: string
  kind: string
  title: string
  answer: 'yes' | 'no' | 'ran'
  at: number
  ranId?: string
  scanned?: true
}

declare module 'claude-code' {
  interface PluginState {
    'ship-band': { asks: Shaped<Ask[]>; history: Shaped<Done[]> }
  }
}
