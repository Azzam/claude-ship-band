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

test('answering moves a step into the session strip; open rows keep their buttons', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  mock.clock(on)

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

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /This session/ })).toBeUndefined()
  await ui.press({ key: 'y-0:commit:my-app' })
  await ui.press({ key: 'n-1:device:iPhone · Debug' })
  expect(sent).toEqual(['Yes, go ahead: commit my-app (3 files on main)'])
  expect(origins).toEqual(['plugin'])

  // The open row keeps its two buttons; the answered ones sit in the strip.
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(2)
  expect((await ui.find({ type: 'Text', text: /web tests/ }))?.text).toContain('verify')
  expect(await ui.find({ type: 'Text', text: /This session/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /✓ 1/ }))?.text).toBe('✓ 1  ✕ 1')
  expect(await ui.find({ type: 'Text', text: /^my-app$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^iPhone · Debug$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^install$/ })).toBeDefined()
  // One tile for the open row, one badged tile per answered step.
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(3)
  await ui.unmount()

  // A new offer replaces the open rows only; the strip stays.
  await $.tool.call({ tool: 'mcp__ship-band__offer_actions', actions: [] })
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.findAll({ type: 'Button' })).toHaveLength(0)
  expect((await term.find({ type: 'Text', text: /✓ 1/ }))?.text).toBe('✓ 1  ✕ 1')
  expect(await term.find({ type: 'Text', text: /^my-app$/ })).toBeDefined()
  await term.unmount()
})

test('the strip shows the newest 5 and counts the rest as earlier', async ($, on) => {
  engine(on)
  mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__ship-band__offer_actions',
    actions: ['a', 'b', 'c', 'd', 'e', 'f'].map(t => ({ kind: 'run', title: `job-${t}` })),
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  for (const [i, t] of ['a', 'b', 'c', 'd', 'e', 'f'].entries()) await ui.press({ key: `n-${i}:run:job-${t}` })

  expect((await ui.find({ type: 'Text', text: /✓ 0/ }))?.text).toBe('✓ 0  ✕ 6')
  expect(await ui.find({ type: 'Text', text: /^earlier$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^job-a$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^job-f$/ })).toBeDefined()
  // 5 badged tiles plus the "+1" tile.
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(6)
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
