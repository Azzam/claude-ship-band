import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask } from '../types'
import { BUILT_IN, FALLBACK, ICONS, merge, NAME, NO, tile, YES } from './modes'
import type { Mode } from './modes'

const asks = atom({ plugin: 'ship-band', key: 'asks' } as const, [], {
  shape: 'asks-1',
})

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

    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // A row whose mode was removed since it was offered still draws, plainly.
    const modeOf = (a: Ask): Mode => modes[a.kind] ?? { label: a.kind, icon: 'zap', color: FALLBACK, hint: '' }
    const icon = (m: Mode) =>
      'Svg' in ui ? (
        <ui.Svg source={tile(m)} alt={m.label} width={32} height={32} />
      ) : (
        // Terminal has no Svg: a coloured dot stands in.
        <Text color={m.color} bold>
          ●
        </Text>
      )
    const drop = (id: string) => update($, asks, l => l.filter(a => a.id !== id))
    const yes = (a: Ask) => {
      void drop(a.id)
      void $.prompt.submit({
        text: `Yes, go ahead: ${modeOf(a).label} ${a.title}${a.detail ? ` (${a.detail})` : ''}`,
        asUser: true,
      })
    }

    return (
      <Box flexDirection="column" rowGap="sm" paddingX={1}>
        {list.map(a => {
          const m = modeOf(a)
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
                <Button key={`n-${a.id}`} label="No" role="dismiss" onPress={() => void drop(a.id)}>
                  <Text color={NO} bold>
                    ✕
                  </Text>{' '}
                  No
                </Button>
                <Button key={`y-${a.id}`} label="Yes" onPress={() => yes(a)}>
                  <Text color={YES} bold>
                    ✓
                  </Text>{' '}
                  Yes
                </Button>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
