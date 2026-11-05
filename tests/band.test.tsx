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
const engine = (on: On, sent: string[] = [], store: Record<string, unknown> = {}) => {
  mock.store(on, store)
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
  expect((await ui.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 1  ✕ 1')
  // Action and target sit on one line beside the icon.
  expect((await ui.find({ type: 'Text', text: /my-app/ }))?.text).toBe('commit  my-app')
  expect((await ui.find({ type: 'Text', text: /iPhone/ }))?.text).toBe('install  iPhone · Debug')
  // The open row: its tile and the two marks beside Yes and No; then one badged tile per answered step.
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(5)
  await ui.unmount()

  // A new offer replaces the open rows only; the strip stays.
  await $.tool.call({ tool: 'mcp__ship-band__offer_actions', actions: [] })
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.findAll({ type: 'Button' })).toHaveLength(0)
  expect((await term.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 1  ✕ 1')
  expect((await term.find({ type: 'Text', text: /my-app/ }))?.text).toBe('commit  my-app')
  await term.unmount()
})

test('the strip shows the newest 6 and counts the rest as earlier', async ($, on) => {
  engine(on)
  mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Every step on its own row: seven runs, not one.
  await $.tool.call({ tool: 'mcp__ship-band__edit_modes', settings: { group: false } })
  await $.tool.call({
    tool: 'mcp__ship-band__offer_actions',
    actions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(t => ({ kind: 'run', title: `job-${t}` })),
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  for (const [i, t] of ['a', 'b', 'c', 'd', 'e', 'f', 'g'].entries()) await ui.press({ key: `n-${i}:run:job-${t}` })

  expect((await ui.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 0  ✕ 7  ·  +1 earlier')
  expect(await ui.find({ type: 'Text', text: /job-a/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /job-g/ })).toBeDefined()
  // One badged tile per shown step.
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

const bash = (command: string, id: string) => ({ tool: 'Bash' as const, command, tool_use_id: id })

test('commands Claude runs join the report; a Yes takes its own command; failures do not count', async ($, on) => {
  engine(on)
  mock.clock(on)
  // Beneath the mod, Bash answers; `gh pr merge` fails.
  on('tool.call', (_, e) =>
    String((e as { command?: string }).command).includes('merge')
      ? { result: { stdout: '', stderr: 'no' }, isError: true as const }
      : { result: { stdout: '', stderr: '' } },
  )
  await $.session.start({ cwd: '/w/my-app', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ship-band__offer_actions', actions: [{ kind: 'commit', title: 'my-app' }] })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'y-0:commit:my-app' })

  await $.tool.call(bash('cd /w/my-app && git commit -m "push docs"', 'b1'))
  await $.tool.call(bash('git -C /w/shop push origin main', 'b2'))
  await $.tool.call(bash('gh pr merge 3', 'b3'))
  await $.tool.call(bash('npm test', 'b4'))

  // The commit carried out the approved step; the push is one Claude ran.
  expect((await ui.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 1  ✕ 0  ·  1 ran')
  expect((await ui.find({ type: 'Text', text: /shop/ }))?.text).toBe('push  shop')
  expect(await ui.find({ type: 'Text', text: /merge/ })).toBeUndefined()
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(2)
  await ui.unmount()
})

test('a reopened session rebuilds its report from what was saved and from its transcript', async ($, on) => {
  engine(on, [], {
    'session:s1': [{ id: 'x', kind: 'commit', title: 'my-app', answer: 'yes', at: 1, ranId: 't0:commit' }],
  })
  on('session.id', () => ({ value: 's1' }))
  on('session.messages', () => ({
    value: [
      {
        role: 'assistant',
        text: '',
        toolUses: [
          { tool_use_id: 't0', tool: 'Bash', input: { command: 'git commit -m x' }, text: 'ok' },
          { tool_use_id: 't1', tool: 'Bash', input: { command: 'gh pr merge 12 -R me/shop' }, text: 'ok' },
          { tool_use_id: 't2', tool: 'Bash', input: { command: 'vercel --prod' }, text: 'err', isError: true },
          { tool_use_id: 't3', tool: 'Read', input: { file_path: 'git push' }, text: 'ok' },
          { tool_use_id: 't4', tool: 'Bash', input: { command: 'git push' }, text: '   1a2b3c4..5d6e7f8  main -> main' },
        ],
      },
    ],
  }))
  await $.session.start({ cwd: '/w/my-app', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 1  ✕ 0  ·  2 ran')
  expect(await ui.find({ type: 'Text', text: /^commit {2}my-app$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /shop/ }))?.text).toBe('merge  shop #12')
  // The transcript keeps what git printed: the branch the push updated.
  expect(await ui.find({ type: 'Text', text: /^ran · main$/ })).toBeDefined()
  // Only the transcript knows the merge: no time for it.
  expect(await ui.find({ type: 'Text', text: /^ran$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /vercel|deploy/ })).toBeUndefined()
  await ui.unmount()
})

test('a mode with its own match counts the project script, once', async ($, on) => {
  engine(on)
  mock.clock(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  await $.session.start({ cwd: '/w/api', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ship-band__edit_modes', add: [{ name: 'deploy', match: '\\./deploy\\.sh' }, { name: 'bad', match: '(' }] })
  await $.tool.call(bash('./deploy.sh production', 'd1'))
  await $.tool.call(bash('vercel --prod && ./deploy.sh', 'd2'))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 0  ✕ 0  ·  2 ran')
  // Grouped: one row for the two deploys of api.
  expect(await ui.findAll({ type: 'Text', text: /^deploy {2}api/ })).toHaveLength(1)
  expect((await ui.find({ type: 'Text', text: /^deploy {2}api/ }))?.text).toBe('deploy  api ×2')
  await ui.unmount()
})

test('report settings: how many, one column, auto-detect off', async ($, on) => {
  engine(on)
  mock.clock(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  await $.session.start({ cwd: '/w/app', surface: 'desktop', isInteractive: true })
  const r = JSON.stringify(
    await $.tool.call({ tool: 'mcp__ship-band__edit_modes', settings: { show: 99, columns: 1, detect: false } }),
  )
  expect(r).toContain('Report: show 12, 1 column(s), auto-detect off, group repeats on')
  await $.tool.call(bash('git commit -m x && git push', 'c1'))
  await $.tool.call({ tool: 'mcp__ship-band__offer_actions', actions: [{ kind: 'deploy', title: 'api' }] })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'n-0:deploy:api' })
  // Only the panel answer is reported; the commit and push are not.
  expect((await ui.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 0  ✕ 1')
  expect(await ui.find({ type: 'Text', text: /^commit/ })).toBeUndefined()
  await ui.unmount()
})

test('each commit and push shows the branch or tag it landed on', async ($, on) => {
  engine(on)
  mock.clock(on)
  // What git printed for each call, as the model read it.
  const OUT: Record<string, string> = {
    r1: "38385a9 v1\nTo https://github.com/me/xplayer.git\n * [new branch]      main -> main\nbranch 'main' set up to track 'origin/main'.",
    r2: 'To https://github.com/me/xplayer.git\n * [new tag]         v1.0.0 -> v1.0.0\nhttps://github.com/me/xplayer/releases/tag/v1.0.0',
    r3: '[version2 940d035] v2\n 3 files changed\nTo https://github.com/me/xplayer.git\n   38385a9..940d035  version2 -> version2',
    r4: 'https://github.com/me/xplayer/pull/7',
    r6: ' ! [rejected]        main -> main (fetch first)',
  }
  on('tool.call', (_, e) => ({ result: { stdout: '', stderr: '' }, text: OUT[e.tool_use_id] ?? '' }))
  await $.session.start({ cwd: '/w/LG-TV', surface: 'desktop', isInteractive: true })
  // Every step on its own row, to see each one's branch.
  await $.tool.call({ tool: 'mcp__ship-band__edit_modes', settings: { show: 12, group: false } })

  // git commit -q prints no branch: the push in the same command names it.
  await $.tool.call(bash('git commit -q -m "v1" && git -c credential.helper= -c "credential.helper=!f() { echo x; }; f" push -u origin main 2>&1 | tail -4', 'r1'))
  // A tag push; gh's --repo names the release, not the push beside it.
  await $.tool.call(bash('git tag -a v1.0.0 -m "v1" && git push origin v1.0.0 2>&1 | tail -2 && gh release create v1.0.0 --repo me/xplayer', 'r2'))
  await $.tool.call(bash('git commit -m "v2" && git push -u origin version2', 'r3'))
  await $.tool.call(bash('gh pr create --fill', 'r4'))
  // Nothing printed: the command's own refspec.
  await $.tool.call(bash('git push origin HEAD:release-1', 'r5'))
  // Rejected, though tail hid the exit code: no branch to claim.
  await $.tool.call(bash('git push 2>&1 | tail -1', 'r6'))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Text', text: /^commit {2}LG-TV$/ })).toHaveLength(2)
  expect(await ui.findAll({ type: 'Text', text: /^push {2}LG-TV$/ })).toHaveLength(5)
  expect(await ui.find({ type: 'Text', text: /^release {2}xplayer v1\.0\.0$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^open PR {2}LG-TV #7$/ })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /^ran(?: \d\d:\d\d)? · main$/ })).toHaveLength(2)
  expect(await ui.findAll({ type: 'Text', text: /^ran(?: \d\d:\d\d)? · version2$/ })).toHaveLength(2)
  expect(await ui.findAll({ type: 'Text', text: /^ran(?: \d\d:\d\d)? · v1\.0\.0$/ })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Text', text: /^ran(?: \d\d:\d\d)? · release-1$/ })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Text', text: /^ran(?: \d\d:\d\d)?$/ })).toHaveLength(3)
  await ui.unmount()
})

test('an empty session shows one quiet line; a step replaces it', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /no steps yet/ }))?.text).toBe('This session  ·  no steps yet')
  await ui.unmount()

  await $.tool.call({ tool: 'mcp__ship-band__offer_actions', actions: [{ kind: 'commit', title: 'my-app' }] })
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /no steps yet/ })).toBeUndefined()
  expect(await term.findAll({ type: 'Button' })).toHaveLength(2)
  await term.unmount()
})

test('one row per action: its targets, a count, the latest status, every branch newest first', async ($, on) => {
  engine(on)
  mock.clock(on)
  const OUT: Record<string, string> = {
    g1: '[main 1a2b3c4] a\n   0a0a0a0..1a2b3c4  main -> main',
    g2: '[version2 5d6e7f8] b\n * [new branch]      version2 -> version2',
    g3: '[main 9a9a9a9] c\n   1a2b3c4..9a9a9a9  main -> main',
    g4: '[main 0b0b0b0] d',
  }
  on('tool.call', (_, e) => ({ result: { stdout: '', stderr: '' }, text: OUT[e.tool_use_id] ?? '' }))
  await $.session.start({ cwd: '/w/LG-TV', surface: 'desktop', isInteractive: true })
  await $.tool.call(bash('git commit -m a && git push', 'g1'))
  await $.tool.call(bash('git commit -m b && git push -u origin version2', 'g2'))
  await $.tool.call({ tool: 'mcp__ship-band__offer_actions', actions: [{ kind: 'deploy', title: 'tv' }] })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'n-0:deploy:tv' })
  await $.tool.call(bash('git commit -m c && git push', 'g3'))
  // Another folder: still the one commit row.
  await $.tool.call(bash('git -C /w/shop commit -m d', 'g4'))

  // Seven steps, three rows; the header still counts every step.
  expect((await ui.find({ type: 'Text', text: /This session/ }))?.text).toBe('This session  ✓ 0  ✕ 1  ·  7 ran')
  expect(await ui.findAll({ type: 'Text', text: /^commit {2}/ })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Text', text: /^push {2}/ })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Text', text: /^ran(?: \d\d:\d\d)? · main, version2$/ })).toHaveLength(2)
  // Rows follow their latest step; targets read newest first.
  const titles = (await ui.findAll({ type: 'Text', text: /^(?:commit|push|deploy) {2}/ })).map(t => t.text)
  expect(titles).toEqual(['deploy  tv', 'push  LG-TV ×3', 'commit  shop, LG-TV ×4'])
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(3)
  await ui.unmount()
})
