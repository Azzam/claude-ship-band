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
    origins.push((e.origin as { kind?: string } | undefined)?.kind ?? 'none')
    return { text: e.text }
  })
}
const origins: string[] = []

test('Yes and No turn the buttons into a report; the person\'s next message clears it', async ($, on) => {
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

  // Answered rows stay, with a report and no buttons; the open row keeps its own.
  expect((await ui.find({ type: 'Text', text: /sent to Claude/ }))?.text).toBe('✓ Yes · commit sent to Claude')
  expect((await ui.find({ type: 'Text', text: /skipped/ }))?.text).toBe('✕ No · skipped')
  expect((await ui.find({ type: 'Text', text: /iPhone/ }))?.text).toContain('install')
  expect(await ui.find({ key: 'y-0:commit:my-app' })).toBeUndefined()
  expect(await ui.find({ key: 'n-1:device:iPhone · Debug' })).toBeUndefined()
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(2)
  await ui.unmount()

  // The mod's own Yes message did not clear them; the person's next message does.
  await $.prompt.submit({ text: 'thanks', asUser: true })
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(origins).toEqual(['plugin', 'none'])
  expect(await after.find({ type: 'Text', text: /my-app/ })).toBeUndefined()
  expect(await after.find({ type: 'Text', text: /iPhone/ })).toBeUndefined()
  expect((await after.find({ type: 'Text', text: /web tests/ }))?.text).toContain('verify')
  await after.unmount()
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
