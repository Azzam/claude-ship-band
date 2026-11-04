import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

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

// Stands for the engine: what it draws, registers and submits beneath the mod.
const engine = (on: On, sent: string[] = []) => {
  mock.store(on)
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
}

test('offered steps show as rows; Yes submits and clears, No clears', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({
    tool: 'mcp__ship-band__offer_actions',
    actions: [
      { kind: 'commit', title: 'my-app', detail: '3 files on main' },
      { kind: 'device', title: 'iPhone · Debug' },
      { kind: 'verify', title: 'web tests' },
      { kind: 'nope', title: 'dropped' },
    ],
  })
  expect(JSON.stringify(r)).toContain('Shown 3 row')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /my-app/ }))?.text).toContain('commit')
    expect((await ui.find({ type: 'Text', text: /3 files on main/ }))?.text).toBe('3 files on main')
    expect((await ui.find({ type: 'Text', text: /iPhone/ }))?.text).toContain('install')
    expect((await ui.find({ type: 'Text', text: /web tests/ }))?.text).toContain('verify')
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /dropped/ })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'y-0:commit:my-app' })
  await ui.press({ key: 'n-1:device:iPhone · Debug' })
  expect(sent[0]).toBe('Yes, go ahead: commit my-app (3 files on main)')
  expect(sent.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /iPhone/ })).toBeUndefined()
  await ui.unmount()
})

test('the person adds a mode and relabels a built-in; bad values fall back', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const edited = await $.tool.call({
    tool: 'mcp__ship-band__edit_modes',
    add: [
      { name: 'translate', label: 'translate', icon: 'globe', color: '#ec4899', hint: 'update locale files' },
      { name: 'commit', label: 'save' },
      { name: 'Bad Name!' },
      { name: 'odd', icon: 'nope', color: 'red"/><script>' },
    ],
  })
  const text = JSON.stringify(edited)
  expect(text).toContain('translate: \\"translate\\", globe, #ec4899')
  expect(text).toContain('commit: \\"save\\"')
  expect(text).toContain('odd: \\"odd\\", zap, #64748b')
  expect(text).toContain('Skipped bad names: Bad Name!')

  await $.tool.call({
    tool: 'mcp__ship-band__offer_actions',
    actions: [
      { kind: 'translate', title: 'ru locale' },
      { kind: 'commit', title: 'my-app' },
    ],
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /ru locale/ }))?.text).toContain('translate')
  expect((await ui.find({ type: 'Text', text: /my-app/ }))?.text).toContain('save')
  await ui.unmount()

  // Removing an override brings the built-in back.
  const back = JSON.stringify(await $.tool.call({ tool: 'mcp__ship-band__edit_modes', remove: ['commit', 'translate'] }))
  expect(back).toContain('commit: \\"commit\\"')
  expect(back).not.toContain('translate:')
})
