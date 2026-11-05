import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask, Done } from '../types'
import { detect } from './detect'
import { badged, BUILT_IN, FALLBACK, ICONS, mark, merge, NAME, NO, tile, YES } from './modes'
import type { Mode } from './modes'

// Open steps. asks-2: answered rows no longer stay here (0.3.0 kept them with an `answer`).
const asks = atom({ plugin: 'ship-band', key: 'asks' } as const, [], {
  shape: 'asks-2',
})
// Every answered step of the session, oldest first; the strip shows the newest few.
const history = atom({ plugin: 'ship-band', key: 'history' } as const, [], {
  shape: 'history-1',
})
// Local time: the mod's sandbox keeps the machine's time zone.
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Modes the person added or changed, kept across sessions.
const STORE_KEY = 'modes'
type Saved = Record<string, Partial<Mode>>

const describe = (modes: Record<string, Mode>) =>
  'When your work leaves the person a step to approve, call this with one item per step instead of asking in prose; the person answers with Yes/No buttons above the prompt. ' +
  `Modes: ${Object.entries(modes)
    .map(([name, m]) => (m.hint ? `${name} (${m.hint})` : name))
    .join('; ')}. ` +
  'Each item: kind (one of the modes; shown as its label), a title naming only the target with no verb ("my-app", "backend → staging", "iPhone · Debug"), and a short detail (files and branch, what ships, build type). ' +
  'Never run the step before a Yes arrives as a prompt. Replaces the current rows; an empty list clears them.'

const EDIT =
  'Add, change or remove ship-band modes (the kinds of step offer_actions can show). Call only when the person asks. ' +
  'add: each {name (lowercase, a-z 0-9 -), label (the verb shown), icon, color (#rrggbb), hint (when to use it), match (optional regex for a shell command that does this step, such as "\\./deploy\\.sh", so the session report counts it when Claude runs it)}; giving a built-in name changes that built-in. ' +
  'remove: names; a removed built-in goes back to its default. ' +
  `Built-ins: ${Object.keys(BUILT_IN).join(', ')}. Icons: ${Object.keys(ICONS).join(', ')}. ` +
  'settings: {show (2-12 rows in the session report, default 6), columns (1 or 2, default 2), detect (true: also report commits, pushes, PRs, deploys Claude ran without the panel; default true), group (true: one row per action, with its targets and a count; false: every step on its own row; default true)}. ' +
  'Kept across sessions. Returns the modes and settings now in use.'

// Reset on each load of the module; session.start fills it from the store.
let modes: Record<string, Mode> = { ...BUILT_IN }

// The session report's own settings, kept across sessions like the modes.
type Settings = { show: number; columns: 1 | 2; detect: boolean; group: boolean }
const DEFAULTS: Settings = { show: 6, columns: 2, detect: true, group: true }
const SETTINGS_KEY = 'settings'
let settings: Settings = { ...DEFAULTS }
const cleanSettings = (v: unknown): Settings => {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Settings>
  return {
    show: Number.isInteger(o.show) ? Math.min(12, Math.max(2, o.show as number)) : DEFAULTS.show,
    columns: o.columns === 1 ? 1 : 2,
    detect: typeof o.detect === 'boolean' ? o.detect : DEFAULTS.detect,
    group: typeof o.group === 'boolean' ? o.group : DEFAULTS.group,
  }
}

// This session's id and folder, set at session.start.
let sid = 'local'
let cwd = ''
const SESSIONS = 'sessions'
const KEEP = 50

const matchers = (): [string, RegExp][] =>
  Object.entries(modes).flatMap(([kind, m]): [string, RegExp][] => {
    try {
      return m.match ? [[kind, new RegExp(m.match)]] : []
    } catch {
      return []
    }
  })

// Saves this session's own steps (not the ones rebuilt from the transcript) and
// keeps the newest 50 sessions in the store.
async function persist($: EngineInterface, list: Done[]) {
  try {
    await $.store.set(`session:${sid}`, list.filter(d => !d.scanned))
    const ids = ((await $.store.get(SESSIONS)) ?? []) as string[]
    if (ids.at(-1) !== sid) {
      const next = [...ids.filter(i => i !== sid), sid]
      for (const old of next.slice(0, -KEEP)) await $.store.delete(`session:${old}`)
      await $.store.set(SESSIONS, next.slice(-KEEP))
    }
  } catch {
    // ponytail: a full or unreadable store only costs the report on resume
  }
}

// A command that shipped something: an approved step of the same kind that has
// not run yet takes it; anything else is a step Claude ran without the panel.
async function noteRun($: EngineInterface, command: string, id: string, out: string) {
  const found = settings.detect ? detect(command, cwd, matchers(), out) : []
  if (found.length === 0) return
  const at = await $.clock.now()
  const list = await update($, history, h => {
    const next = [...h]
    for (const f of found) {
      const fid = `${id}:${f.kind}`
      if (next.some(d => d.id === fid || d.ranId === fid)) continue
      const i = next.findLastIndex(d => d.answer === 'yes' && d.kind === f.kind && !d.ranId)
      const ref = f.ref ? { ref: f.ref } : {}
      if (i >= 0) next[i] = { ...next[i]!, ranId: fid, ...ref }
      else next.push({ id: fid, kind: f.kind, title: f.title, answer: 'ran', at, ...ref })
    }
    return next.slice(-200)
  })
  await persist($, list)
}

// On start (new, resumed or reloaded session): the saved steps, plus what the
// transcript shows was run that nothing saved (no time is known for those).
async function rebuild($: EngineInterface) {
  const stored = (await $.store.get(`session:${sid}`).catch(() => undefined)) as Done[] | undefined
  const saved = Array.isArray(stored) ? stored : (await read($, history)).filter(d => !d.scanned)
  const known = new Set(saved.flatMap(d => [d.id, d.ranId ?? '']))
  const scanned: Done[] = []
  const messages = settings.detect ? await $.session.messages().catch(() => []) : []
  for (const m of Array.isArray(messages) ? messages : []) {
    for (const u of m.toolUses ?? []) {
      const command = (u.input as { command?: unknown } | undefined)?.command
      if (u.tool !== 'Bash' || u.isError || u.text === undefined || typeof command !== 'string') continue
      for (const f of detect(command, cwd, matchers(), u.text)) {
        const fid = `${u.tool_use_id}:${f.kind}`
        if (known.has(fid)) continue
        known.add(fid)
        scanned.push({ id: fid, kind: f.kind, title: f.title, answer: 'ran', at: 0, scanned: true, ...(f.ref ? { ref: f.ref } : {}) })
      }
    }
  }
  await update($, history, () => [...scanned, ...saved].slice(-200))
}

async function load($: EngineInterface) {
  // An unreadable store still leaves the built-ins, so the tools always register.
  const saved = await $.store.get(STORE_KEY).catch(() => undefined)
  modes = merge((saved ?? {}) as Saved)
  settings = cleanSettings(await $.store.get(SETTINGS_KEY).catch(() => undefined))
}

// Registering again replaces the tool, so its kind list follows the modes.
function registerOffer($: EngineInterface) {
  return $.tool.register({
    name: 'offer_actions',
    isDeferred: false,
    description: describe(modes),
    inputSchema: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            required: ['kind', 'title'],
            properties: {
              kind: { enum: Object.keys(modes) },
              title: { type: 'string', description: 'Target only, no verb: "my-app", "iPhone · Debug"' },
              detail: { type: 'string', description: 'Short: "3 files on main", "gateway image"' },
            },
          },
        },
      },
    },
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    sid = await $.session.id().catch(() => 'local')
    await load($)
    await registerOffer($)
    await $.tool.register({
      name: 'edit_modes',
      description: EDIT,
      inputSchema: {
        type: 'object',
        properties: {
          add: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', pattern: NAME.source },
                label: { type: 'string', maxLength: 20 },
                icon: { enum: Object.keys(ICONS) },
                color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
                hint: { type: 'string', maxLength: 80 },
                match: { type: 'string', maxLength: 200 },
              },
            },
          },
          remove: { type: 'array', items: { type: 'string' } },
          settings: {
            type: 'object',
            properties: {
              show: { type: 'integer', minimum: 2, maximum: 12 },
              columns: { enum: [1, 2] },
              detect: { type: 'boolean' },
              group: { type: 'boolean' },
            },
          },
        },
      },
    })
    await rebuild($).catch(() => undefined)

    return next(e)
  })

  // Commands Claude runs: a successful one that ships something joins the report.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!ran.deny && !ran.isError) {
      const at = await $.clock.now()
      await noteRun($, String(e.command ?? ''), e.tool_use_id ?? `t${at}`, ran.text ?? '').catch(() => undefined)
    }
    return ran
  })

  on('tool.call', { tool: 'mcp__ship-band__offer_actions' }, async ($, e) => {
    // Tool arguments ride top-level on `e`, beside `tool`.
    const { actions } = e as unknown as { actions?: Partial<Ask>[] }
    const list: Ask[] = (Array.isArray(actions) ? actions : [])
      .filter(a => typeof a.kind === 'string' && a.kind in modes && a.title)
      .map((a, i) => ({
        id: `${i}:${a.kind}:${a.title}`,
        kind: String(a.kind),
        title: String(a.title),
        detail: String(a.detail ?? ''),
      }))
    await update($, asks, () => list)

    return {
      result: list.length
        ? `Shown ${list.length} row(s) above the prompt. Stop here and wait: a Yes arrives as the person's next prompt.`
        : 'Cleared the rows.',
    }
  }).catch(() => ({ deny: 'ship-band could not show the rows; ask in prose instead.' }))

  on('tool.call', { tool: 'mcp__ship-band__edit_modes' }, async ($, e) => {
    const { add, remove, settings: change } = e as unknown as {
      add?: (Partial<Mode> & { name?: string })[]
      remove?: string[]
      settings?: Partial<Settings>
    }
    const saved = ((await $.store.get(STORE_KEY)) ?? {}) as Saved
    const skipped: string[] = []

    for (const { name, ...m } of Array.isArray(add) ? add : []) {
      if (typeof name !== 'string' || !NAME.test(name)) {
        skipped.push(String(name))
        continue
      }
      saved[name] = { ...saved[name], ...m }
    }
    for (const name of Array.isArray(remove) ? remove : []) delete saved[name]

    await $.store.set(STORE_KEY, saved)
    if (change && typeof change === 'object') await $.store.set(SETTINGS_KEY, cleanSettings({ ...settings, ...change }))
    await load($)
    await registerOffer($)

    const now = Object.entries(modes).map(([name, m]) => `${name}: "${m.label}", ${m.icon}, ${m.color}`)
    return {
      result:
        `${skipped.length ? `Skipped bad names: ${skipped.join(', ')}. ` : ''}Modes now:\n${now.join('\n')}\n` +
        `Report: show ${settings.show}, ${settings.columns} column(s), auto-detect ${settings.detect ? 'on' : 'off'}, ` +
        `group repeats ${settings.group ? 'on' : 'off'}`,
    }
  }).catch(() => ({ deny: 'ship-band could not save the modes.' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, asks)
    // Auto-detect off: steps Claude ran without the panel stay out of the report.
    const done = (await read($, history)).filter(d => settings.detect || d.answer !== 'ran')

    if (e.props.hasSurvey) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // A step whose mode was removed since it was offered still draws, plainly.
    const modeOf = (kind: string): Mode => modes[kind] ?? { label: kind, icon: 'zap', color: FALLBACK, hint: '' }
    const svg = 'Svg' in ui
    const icon = (m: Mode) =>
      svg ? (
        <ui.Svg source={tile(m)} alt={m.label} width={32} height={32} />
      ) : (
        // Terminal has no Svg: a coloured dot stands in.
        <Text color={m.color} bold>
          ●
        </Text>
      )

    // Answering moves the step from the open rows into the session strip.
    const answer = async (a: Ask, value: 'yes' | 'no') => {
      const at = await $.clock.now()
      await update($, asks, l => l.filter(x => x.id !== a.id))
      const saved = await update($, history, h =>
        [...h, { id: `${at}:${a.id}`, kind: a.kind, title: a.title, answer: value, at }].slice(-200),
      )
      await persist($, saved)
      if (value === 'yes') {
        await $.prompt.submit({
          text: `Yes, go ahead: ${modeOf(a.kind).label} ${a.title}${a.detail ? ` (${a.detail})` : ''}`,
          asUser: true,
        })
      }
    }

    const approved = done.filter(d => d.answer === 'yes').length
    const skippedN = done.filter(d => d.answer === 'no').length
    const ranN = done.length - approved - skippedN
    const STATUS = { yes: 'approved', no: 'skipped', ran: 'ran' } as const
    // One row per action: its targets, branches and tags newest first, how many
    // steps, and the latest step's status and time. Raw steps stay in history.
    type Row = { last: Done; n: number; titles: string[]; refs: string[] }
    const newest = (list: string[], v: string) => [v, ...list.filter(x => x !== v)]
    const rows = new Map<string, Row>()
    for (const d of done) {
      const key = settings.group ? d.kind : d.id
      const row = rows.get(key) ?? { last: d, n: 0, titles: [], refs: [] }
      rows.delete(key) // re-inserted last: rows stay in order of their latest step
      row.last = d
      row.n++
      row.titles = newest(row.titles, d.title)
      for (const r of d.ref?.split(', ') ?? []) row.refs = newest(row.refs, r)
      rows.set(key, row)
    }
    // At most two targets per row, and only what fits its column; the rest count as "+N more".
    // ponytail: a character budget stands in for measuring text, which a hook cannot do.
    const budget = settings.columns === 2 ? 32 : 64
    const fit = (titles: string[]) => {
      const out: string[] = []
      for (const t of titles) {
        if (out.length === 2 || (out.length > 0 && [...out, t].join(', ').length > budget)) break
        out.push(t)
      }
      return { text: out.join(', '), more: titles.length - out.length }
    }
    const shown = [...rows.values()].slice(-settings.show)
    const earlier = rows.size - shown.length

    return (
      <Box flexDirection="column" rowGap="md" paddingX={1}>
        {list.map(a => {
          const m = modeOf(a.kind)
          return (
            <Box key={a.id} flexDirection="row" alignItems="center" gap="sm">
              <Box flexShrink={0}>{icon(m)}</Box>
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end">
                  <Text color={m.color} size="footnote" weight="semibold">
                    {m.label}
                  </Text>
                  {'  '}
                  <Text weight="medium">{a.title}</Text>
                </Text>
                {a.detail !== '' && (
                  <Text size="footnote" dimColor wrap="truncate-end">
                    {a.detail}
                  </Text>
                )}
              </Box>
              {svg ? (
                // Desktop: the app's own buttons, each with a coloured mark beside it.
                <Box flexDirection="row" alignItems="center" gap="sm" flexShrink={0}>
                  <Box flexDirection="row" alignItems="center" gap="xs">
                    <ui.Svg source={mark('no')} alt="red cross" width={16} height={16} />
                    <Button key={`n-${a.id}`} label="No" role="dismiss" onPress={() => void answer(a, 'no')} />
                  </Box>
                  <Box flexDirection="row" alignItems="center" gap="xs">
                    <ui.Svg source={mark('yes')} alt="green check" width={16} height={16} />
                    <Button key={`y-${a.id}`} label="Yes" onPress={() => void answer(a, 'yes')} />
                  </Box>
                </Box>
              ) : (
                // Terminal: the marks inside the buttons, in colour.
                <Box flexDirection="row" alignItems="center" gap="xs" flexShrink={0}>
                  <Button key={`n-${a.id}`} role="dismiss" onPress={() => void answer(a, 'no')}>
                    <Text color={NO} bold>
                      ✕
                    </Text>{' '}
                    No
                  </Button>
                  <Button key={`y-${a.id}`} onPress={() => void answer(a, 'yes')}>
                    <Text color={YES} bold>
                      ✓
                    </Text>{' '}
                    Yes
                  </Button>
                </Box>
              )}
            </Box>
          )
        })}

        {/* Nothing yet: one quiet line, so the band shows it is loaded. */}
        {list.length === 0 && done.length === 0 && (
          <Text key="empty" size="footnote" weight="semibold">
            This session<Text dimColor weight="regular">{'  ·  no steps yet'}</Text>
          </Text>
        )}

        {done.length > 0 && (
          <Box key="strip" flexDirection="column" rowGap="sm">
            <Text size="footnote" weight="semibold">
              This session{'  '}
              <Text color={YES}>{`✓ ${approved}`}</Text>
              {'  '}
              <Text color={NO}>{`✕ ${skippedN}`}</Text>
              {ranN > 0 && <Text dimColor weight="regular">{`  ·  ${ranN} ran`}</Text>}
              {earlier > 0 && <Text dimColor weight="regular">{`  ·  +${earlier} earlier`}</Text>}
            </Text>
            {/* Two columns: badged icon, then action and target on one line, status and time under. */}
            <Box flexDirection="row" flexWrap="wrap" rowGap="sm">
              {shown.map(({ last: d, n, titles, refs }) => {
                const m = modeOf(d.kind)
                const target = fit(titles)
                const skipped = d.answer === 'no'
                return (
                  <Box key={d.id} width={settings.columns === 2 ? '50%' : '100%'} flexDirection="row" alignItems="center" gap="sm" paddingRight={1}>
                    <Box flexShrink={0}>
                      {svg ? (
                        <ui.Svg
                          source={badged(m, d.answer)}
                          alt={`${m.label} ${titles.join(', ')}: ${STATUS[d.answer]}`}
                          width={36}
                          height={36}
                        />
                      ) : (
                        <Text>
                          <Text color={m.color} bold>
                            ●
                          </Text>
                          <Text color={skipped ? NO : d.answer === 'yes' ? YES : FALLBACK} bold>
                            {skipped ? '✕' : '✓'}
                          </Text>
                        </Text>
                      )}
                    </Box>
                    <Box flexDirection="column" flexShrink={1}>
                      <Text size="footnote" wrap="truncate-end">
                        {skipped ? (
                          <Text dimColor weight="semibold">
                            {m.label}
                          </Text>
                        ) : (
                          <Text color={m.color} weight="semibold">
                            {m.label}
                          </Text>
                        )}
                        {'  '}
                        <Text weight="medium" dimColor={skipped}>
                          {target.text}
                        </Text>
                        {target.more > 0 || n > 1 ? (
                          <Text dimColor>{`${target.more > 0 ? ` +${target.more} more` : ''}${n > 1 ? ` ×${n}` : ''}`}</Text>
                        ) : null}
                      </Text>
                      {/* Status, time, then the branch or tag it landed on. Single spaces: the
                          desktop draws a string with a run of spaces in a monospace face. */}
                      <Text size="caption" dimColor wrap="truncate-end">
                        {d.at > 0 ? `${STATUS[d.answer]} ${hhmm(d.at)}` : STATUS[d.answer]}
                        {refs.length > 0 ? <Text>{` · ${refs.join(', ')}`}</Text> : null}
                      </Text>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
