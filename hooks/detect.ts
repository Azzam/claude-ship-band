// Finds shipping steps in a shell command Claude ran: pure, no engine imports.
// ponytail: regex heuristics on the command text; a mode's own `match` covers
// project scripts (./deploy.sh). Tests and plain `run` are left out: too frequent.

export type Found = { kind: string; title: string }

// Flags git takes before its subcommand: -C path, -c key=value, --no-pager...
const GIT = String.raw`\bgit\b(?:\s+-[Cc]\s+\S+|\s+--?[\w.-]+(?:=\S*)?)*\s+`

const BUILT: [string, RegExp][] = [
  ['commit', new RegExp(`${GIT}commit\\b(?![^\\n]*--dry-run)`)],
  ['push', new RegExp(`${GIT}push\\b(?![^\\n]*--dry-run)`)],
  ['pr', /\bgh\s+pr\s+create\b/],
  ['merge', new RegExp(`\\bgh\\s+pr\\s+merge\\b|${GIT}merge\\s+(?!--abort)\\S`)],
  ['release', /\bgh\s+release\s+create\b/],
  [
    'publish',
    /\b(?:npm|pnpm|yarn)\s+(?:npm\s+)?publish\b|\beas\s+submit\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bfastlane\b[^\n]*\b(?:deliver|pilot|supply|upload_to_app_store|upload_to_testflight)\b/,
  ],
  [
    'deploy',
    /\bvercel\b[^\n]*(?:--prod|\bdeploy\b)|\b(?:fly|flyctl)\s+deploy\b|\bkubectl\s+(?:apply|rollout\s+restart|set\s+image)\b|\bnetlify\s+deploy\b|\bwrangler\s+(?:deploy|publish)\b|\bfirebase\s+deploy\b|\bgcloud\b[^\n]*\bdeploy\b|\bterraform\s+apply\b|\bhelm\s+(?:upgrade|install)\b|\beas\s+update\b/,
  ],
  [
    'device',
    /\bxcrun\s+devicectl\b[^\n]*\binstall\b|\bxcrun\s+simctl\s+install\b|\bios-deploy\b|\badb\b[^\n]*\binstall\b|\bexpo\s+run:(?:ios|android)\b|\breact-native\s+run-(?:ios|android)\b/,
  ],
  [
    'migrate',
    /\bprisma\s+migrate\s+(?:deploy|dev)\b|\balembic\s+upgrade\b|\b(?:rails|rake)\s+db:migrate\b|\bmanage\.py\s+migrate\b|\bknex\s+migrate\b|\bsequelize\b[^\n]*\bdb:migrate\b|\bdrizzle-kit\s+(?:push|migrate)\b/,
  ],
]

const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '')
const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p

// The folder a command works in: git -C, then cd, then gh -R, else the session's.
const repoOf = (cmd: string, cwd: string) => {
  // Simple VAR=value assignments in the same command, so `cd $D` resolves.
  const vars: Record<string, string> = {}
  for (const m of cmd.matchAll(/(?:^|[\s;&])([A-Za-z_]\w*)=([^\s;&|'"]+)/g)) vars[m[1]!] = m[2]!
  const expand = (s: string) => s.replace(/\$\{?(\w+)\}?/g, (all, v: string) => vars[v] ?? all)
  const path =
    cmd.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)?.[1] ??
    cmd.match(/(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/)?.[1] ??
    cmd.match(/\s(?:-R|--repo)[\s=]+([\w.-]+\/[\w.-]+)/)?.[1]
  const p = path ? expand(unquote(path)) : ''
  return p && !p.includes('$') ? base(p) : base(cwd) || 'this folder'
}

const deviceOf = (cmd: string) =>
  /simctl/.test(cmd) ? 'Simulator' : /devicectl|ios-deploy/.test(cmd) ? 'iPhone' : /run[:-]ios/.test(cmd) ? 'iOS' : 'Android'

export const detect = (cmd: string, cwd: string, custom: [string, RegExp][] = []): Found[] => {
  // Quoted text (commit messages, echo) never counts as a command.
  const bare = cmd.replace(/'[^']*'|"[^"]*"/g, "''")
  const repo = repoOf(cmd, cwd)
  const found: Found[] = []
  for (const [kind, re] of [...BUILT, ...custom]) {
    // A mode's own match for a built-in kind (deploy: ./deploy.sh) adds no second step.
    if (found.some(f => f.kind === kind) || !re.test(bare)) continue
    let title = repo
    if (kind === 'merge') {
      const n = cmd.match(/\bgh\s+pr\s+merge\s+#?(\d+)/)?.[1]
      if (n) title = `${repo} #${n}`
    } else if (kind === 'release') {
      const tag = cmd.match(/\bgh\s+release\s+create\s+([^\s'"]+)/)?.[1]
      if (tag) title = `${repo} ${tag}`
    } else if (kind === 'device') {
      title = deviceOf(bare)
    }
    found.push({ kind, title })
  }
  return found
}
