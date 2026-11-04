// Modes: what a row asks to do. Pure data, no engine imports, so the README
// preview script can import it as is.

export type Mode = { label: string; icon: string; color: string; hint: string }

// Yes/No own green and red, so no mode uses them.
export const YES = '#22c55e'
export const NO = '#ef4444'
export const FALLBACK = '#64748b'

// Lucide / Feather icons (ISC / MIT), 24-unit grid, drawn with one stroke weight.
export const ICONS: Record<string, string> = {
  commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  'pull-request': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  'shield-check':
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  package:
    '<path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  play: '<path d="M6 3l14 9-14 9z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh:
    '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
}

export const BUILT_IN: Record<string, Mode> = {
  commit: { label: 'commit', icon: 'commit', color: '#8b5cf6', hint: 'git commit' },
  push: { label: 'push', icon: 'upload', color: '#6366f1', hint: 'git push to a remote' },
  pr: { label: 'open PR', icon: 'pull-request', color: '#06b6d4', hint: 'open a pull request' },
  merge: { label: 'merge', icon: 'merge', color: '#d946ef', hint: 'merge a branch or PR' },
  verify: { label: 'verify', icon: 'shield-check', color: '#14b8a6', hint: 'run tests, lint, type checks or QA' },
  deploy: { label: 'deploy', icon: 'rocket', color: '#f59e0b', hint: 'deploy to an environment' },
  release: { label: 'release', icon: 'tag', color: '#ec4899', hint: 'tag a version, write release notes' },
  publish: { label: 'publish', icon: 'package', color: '#f97316', hint: 'publish to a store or registry' },
  device: { label: 'install', icon: 'smartphone', color: '#0ea5e9', hint: 'build and install on a phone or simulator' },
  migrate: { label: 'migrate', icon: 'database', color: '#3b82f6', hint: 'run a database migration' },
  run: { label: 'run', icon: 'play', color: FALLBACK, hint: 'run a script, job or command' },
}

export const NAME = /^[a-z][a-z0-9-]{0,19}$/
const HEX = /^#[0-9a-fA-F]{6}$/

// A saved mode is user data: every field is checked before it reaches a drawing.
export const clean = (name: string, m: Partial<Mode>): Mode => ({
  label: typeof m.label === 'string' && m.label.trim() ? m.label.trim().slice(0, 20) : name,
  icon: typeof m.icon === 'string' && m.icon in ICONS ? m.icon : 'zap',
  color: typeof m.color === 'string' && HEX.test(m.color) ? m.color : FALLBACK,
  hint: typeof m.hint === 'string' ? m.hint.slice(0, 80) : '',
})

// Built-ins with saved changes and custom modes laid over them.
export const merge = (saved: Record<string, Partial<Mode>>): Record<string, Mode> => {
  const out: Record<string, Mode> = { ...BUILT_IN }
  for (const [name, m] of Object.entries(saved)) {
    if (NAME.test(name)) out[name] = clean(name, { ...BUILT_IN[name], ...m })
  }
  return out
}

// Tinted rounded tile, icon stroked in the mode's colour (desktop draws Svg as an image: no currentColor).
export const tile = (m: Mode) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="9" fill="${m.color}" fill-opacity=".14"/><g transform="translate(8 8) scale(.6667)" fill="none" stroke="${m.color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${ICONS[m.icon] ?? ICONS.zap}</g></svg>`
