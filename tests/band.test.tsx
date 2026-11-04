import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'ship-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('offered steps show as cards; Yes submits and clears, No clears', async ($, on) => {
  const sent: string[] = []
  // Stands for the engine: draws when the band has nothing to show.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('tool.register', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({
    tool: 'mcp__ship-band__offer_actions',
    actions: [
      { kind: 'commit', title: 'git/extension', detail: '3 files on main' },
      { kind: 'device', title: 'iPhone · Debug' },
      { kind: 'nope', title: 'dropped' },
    ],
  })
  expect(JSON.stringify(r)).toContain("Shown 2 card")

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /git\/extension/ }))?.text).toContain('commit')
    expect((await ui.find({ type: 'Text', text: /3 files on main/ }))?.text).toBe('3 files on main')
    expect((await ui.find({ type: 'Text', text: /iPhone/ }))?.text).toContain('install')
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /dropped/ })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'y-0:commit:git/extension' })
  await ui.press({ key: 'n-1:device:iPhone · Debug' })
  expect(sent[0]).toBe('Yes, go ahead: commit git/extension (3 files on main)')
  expect(sent.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /iPhone/ })).toBeUndefined()
  await ui.unmount()
})
