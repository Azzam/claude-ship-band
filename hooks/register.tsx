import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Ask, AskKind } from '../types'

const TOOL = 'offer_actions'
const asks = atom({ plugin: 'ship-band', key: 'asks' } as const, [], {
  shape: 'asks-1',
})

// The verb; the title names only the target, so nothing reads twice.
const VERB: Record<AskKind, string> = { commit: 'commit', deploy: 'deploy', device: 'install' }

// Mid-tone hues that read on light and dark. Yes/No own green/red, so no kind uses them.
const YES = '#22c55e'
const NO = '#ef4444'
const HUE: Record<AskKind, string> = { commit: '#8b5cf6', deploy: '#f59e0b', device: '#0ea5e9' }

// Lucide icons (ISC), 24-unit grid, one stroke weight: git-commit, rocket, smartphone.
const PATHS: Record<AskKind, string> = {
  commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
  deploy:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  device: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
}

// Tinted rounded tile with the icon stroked in the kind's hue (desktop draws Svg as an image: no currentColor).
const tile = (kind: AskKind) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="9" fill="${HUE[kind]}" fill-opacity=".14"/><g transform="translate(8 8) scale(.6667)" fill="none" stroke="${HUE[kind]}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${PATHS[kind]}</g></svg>`

// Terminal has no Svg: a coloured glyph stands in.
const GLYPH: Record<AskKind, string> = { commit: '●', deploy: '▲', device: '▮' }

// ponytail: guidance lives in the tool description; a prompt.compose section
// was skipped by the org's security plugin, the description always reaches the model.
const GUIDE =
  'When your work leaves the person a commit, a deploy, or a push/install to a device (iOS, Android, simulator) to approve, call this with one item per step instead of asking in prose; the person answers with Yes/No buttons above the prompt. Each item: kind (shown as the verb commit/deploy/install), a title naming only the target with no verb ("my-app", "backend → staging", "iPhone · Debug"), and a short detail (files and branch, what ships, build type). Never run the step before a Yes arrives as a prompt. Replaces the current cards; an empty list clears them.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      isDeferred: false,
      description: GUIDE,
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
                kind: { enum: ['commit', 'deploy', 'device'] },
                title: { type: 'string', description: 'Target only, no verb: "my-app", "iPhone · Debug"' },
                detail: { type: 'string', description: 'Short: "3 files on main", "gateway image"' },
              },
            },
          },
        },
      },
    })

    return next(e)
  })

  on('tool.call', { tool: 'mcp__ship-band__offer_actions' }, async ($, e) => {
    // Tool arguments ride top-level on `e`, beside `tool`.
    const { actions } = e as unknown as { actions?: Partial<Ask>[] }
    // ponytail: trust boundary is the schema; drop anything without a known kind/title
    const list: Ask[] = (Array.isArray(actions) ? actions : [])
      .filter(a => a.kind && a.kind in VERB && a.title)
      .map((a, i) => ({
        id: `${i}:${a.kind}:${a.title}`,
        kind: a.kind as AskKind,
        title: String(a.title),
        detail: String(a.detail ?? ''),
      }))
    await update($, asks, () => list)

    return {
      result: list.length
        ? `Shown ${list.length} card(s) above the prompt. Stop here and wait: a Yes arrives as the person's next prompt.`
        : 'Cleared the cards.',
    }
  }).catch(() => ({ deny: 'ship-band could not show the cards; ask in prose instead.' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, asks)

    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const icon = (kind: AskKind) =>
      'Svg' in ui ? (
        <ui.Svg source={tile(kind)} alt={VERB[kind]} width={32} height={32} />
      ) : (
        <Text color={HUE[kind]} bold>
          {GLYPH[kind]}
        </Text>
      )
    const drop = (id: string) => update($, asks, l => l.filter(a => a.id !== id))
    const yes = (a: Ask) => {
      void drop(a.id)
      void $.prompt.submit({
        text: `Yes, go ahead: ${VERB[a.kind]} ${a.title}${a.detail ? ` (${a.detail})` : ''}`,
        asUser: true,
      })
    }

    return (
      <Box flexDirection="column" rowGap="sm" paddingX={1}>
        {list.map(a => (
          <Box key={a.id} flexDirection="row" alignItems="center" gap="sm">
            <Box flexShrink={0}>{icon(a.kind)}</Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">
                <Text color={HUE[a.kind]} size="footnote" weight="semibold">
                  {VERB[a.kind]}
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
        ))}
      </Box>
    )
  })
}
