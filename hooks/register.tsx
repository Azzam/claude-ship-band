import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask, Done } from '../types'
import { badged, BUILT_IN, FALLBACK, ICONS, merge, more, NAME, NO, tile, YES } from './modes'
import type { Mode } from './modes'

// Open steps. asks-2: answered rows no longer stay here (0.3.0 kept them with an `answer`).
const asks = atom({ plugin: 'ship-band', key: 'asks' } as const, [], {
  shape: 'asks-2',
})
// Every answered step of the session, oldest first; the strip shows the newest few.
const history = atom({ plugin: 'ship-band', key: 'history' } as const, [], {
  shape: 'history-1',
})
const STRIP = 5

const short = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
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
  'add: each {name (lowercase, a-z 0-9 -), label (the verb shown), icon, color (#rrggbb), hint (when to use it)}; giving a built-in name changes that built-in. ' +
  'remove: names; a removed built-in goes back to its default. ' +
  `Built-ins: ${Object.keys(BUILT_IN).join(', ')}. Icons: ${Object.keys(ICONS).join(', ')}. ` +
  'Kept across sessions. Returns the modes now in use.'

// Reset on each load of the module; session.start fills it from the store.
let modes: Record<string, Mode> = { ...BUILT_IN }

async function load($: EngineInterface) {
  // An unreadable store still leaves the built-ins, so the tools always register.
  const saved = await $.store.get(STORE_KEY).catch(() => undefined)
  modes = merge((saved ?? {}) as Saved)
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
              },
            },
          },
          remove: { type: 'array', items: { type: 'string' } },
        },
      },
    })

    return next(e)
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
    const { add, remove } = e as unknown as { add?: (Partial<Mode> & { name?: string })[]; remove?: string[] }
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
    await load($)
    await registerOffer($)

    const now = Object.entries(modes).map(([name, m]) => `${name}: "${m.label}", ${m.icon}, ${m.color}`)
    return {
      result: `${skipped.length ? `Skipped bad names: ${skipped.join(', ')}. ` : ''}Modes now:\n${now.join('\n')}`,
    }
  }).catch(() => ({ deny: 'ship-band could not save the modes.' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, asks)
    const done = await read($, history)

    if (e.props.hasSurvey || (list.length === 0 && done.length === 0)) {
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
      await update($, history, h =>
        [...h, { id: `${at}:${a.id}`, kind: a.kind, title: a.title, answer: value, at }].slice(-200),
      )
      if (value === 'yes') {
        await $.prompt.submit({
          text: `Yes, go ahead: ${modeOf(a.kind).label} ${a.title}${a.detail ? ` (${a.detail})` : ''}`,
          asUser: true,
        })
      }
    }

    const approved = done.filter(d => d.answer === 'yes').length
    const shown = done.slice(-STRIP)
    const earlier = done.length - shown.length

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
              <Box flexDirection="row" alignItems="center" gap="xs" flexShrink={0}>
                <Button key={`n-${a.id}`} label="No" role="dismiss" onPress={() => void answer(a, 'no')}>
                  <Text color={NO} bold>
                    ✕
                  </Text>{' '}
                  No
                </Button>
                <Button key={`y-${a.id}`} label="Yes" onPress={() => void answer(a, 'yes')}>
                  <Text color={YES} bold>
                    ✓
                  </Text>{' '}
                  Yes
                </Button>
              </Box>
            </Box>
          )
        })}

        {done.length > 0 && (
          <Box key="strip" flexDirection="row" alignItems="flex-start" gap="md">
            <Box flexDirection="column" flexShrink={0}>
              <Text size="footnote" weight="semibold">
                This session
              </Text>
              <Text size="footnote" weight="semibold">
                <Text color={YES}>{`✓ ${approved}`}</Text>
                {'  '}
                <Text color={NO}>{`✕ ${done.length - approved}`}</Text>
              </Text>
            </Box>
            <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" gap="md">
              {earlier > 0 && (
                <Box key="earlier" flexDirection="column" alignItems="center">
                  {svg ? (
                    <ui.Svg source={more(earlier)} alt={`${earlier} earlier`} width={36} height={36} />
                  ) : (
                    <Text dimColor>{`+${earlier}`}</Text>
                  )}
                  <Text size="caption" dimColor>
                    earlier
                  </Text>
                </Box>
              )}
              {shown.map(d => {
                const m = modeOf(d.kind)
                const skipped = d.answer === 'no'
                return (
                  <Box key={d.id} flexDirection="column" alignItems="center">
                    {svg ? (
                      <ui.Svg
                        source={badged(m, d.answer)}
                        alt={`${m.label} ${d.title}: ${skipped ? 'no' : 'yes'}`}
                        width={36}
                        height={36}
                      />
                    ) : (
                      <Text>
                        <Text color={m.color} bold>
                          ●
                        </Text>
                        <Text color={skipped ? NO : YES} bold>
                          {skipped ? '✕' : '✓'}
                        </Text>
                      </Text>
                    )}
                    {skipped ? (
                      <Text size="caption" dimColor>
                        {m.label}
                      </Text>
                    ) : (
                      <Text size="caption" weight="semibold" color={m.color}>
                        {m.label}
                      </Text>
                    )}
                    <Text size="caption" weight="medium" dimColor={skipped}>
                      {short(d.title)}
                    </Text>
                    <Text size="caption" dimColor>
                      {hhmm(d.at)}
                    </Text>
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
