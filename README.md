<h1 align="center">ship-band</h1>

<p align="center">A Claude Code mod: Claude asks before it commits, tests, deploys, releases or installs on a device,<br>and you answer from a band above the prompt with <b>✓ Yes</b> or <b>✕ No</b>.</p>

---

When Claude finishes work that leaves a step for you to approve, it puts each step in a row above the prompt instead of asking in a paragraph:

**Light**

![ship-band in light mode: verify, commit, open PR, deploy and install rows, each with No and Yes buttons, above the prompt box](docs/band-light.png)

**Dark**

![ship-band in dark mode: verify, commit, open PR, deploy and install rows, each with No and Yes buttons, above the prompt box](docs/band-dark.png)

<sub>Previews drawn from the mod's own icons and colours; buttons and the prompt box follow your Claude app's own style.</sub>

- **✓ Yes** sends "Yes, go ahead: commit my-app (3 files on main)" as your next message, and Claude runs that step.
- **✕ No** removes the row. Nothing runs.
- Nothing runs before you press Yes.

In the desktop app each row has a drawn icon on a tinted tile. A terminal draws a coloured dot in its place. Yes is always green and No always red, so no mode uses those two colours.

## Modes

| | Mode | Shown as | For |
| --- | --- | --- | --- |
| ![commit](docs/modes/commit.svg) | `commit` | commit | git commit |
| ![push](docs/modes/push.svg) | `push` | push | git push to a remote |
| ![pr](docs/modes/pr.svg) | `pr` | open PR | open a pull request |
| ![merge](docs/modes/merge.svg) | `merge` | merge | merge a branch or PR |
| ![verify](docs/modes/verify.svg) | `verify` | verify | run tests, lint, type checks or QA |
| ![deploy](docs/modes/deploy.svg) | `deploy` | deploy | deploy to an environment |
| ![release](docs/modes/release.svg) | `release` | release | tag a version, write release notes |
| ![publish](docs/modes/publish.svg) | `publish` | publish | publish to a store or registry |
| ![device](docs/modes/device.svg) | `device` | install | build and install on a phone or simulator |
| ![migrate](docs/modes/migrate.svg) | `migrate` | migrate | run a database migration |
| ![run](docs/modes/run.svg) | `run` | run | run a script, job or command |

### Add or change modes

Ask Claude in plain words. It saves the change for you, and it stays across sessions:

- "Add a ship-band mode called translate, globe icon, pink, for updating locale files."
- "Rename the commit mode to save."
- "Make deploy red-orange: #ea580c."
- "Remove the translate mode." Removing a built-in you changed puts it back to its default.

Each mode has a **name** (lowercase letters, digits, `-`), a **label** (the word shown), an **icon**, a **colour** (`#rrggbb`) and a **hint** that tells Claude when to use it. A bad icon or colour falls back to a lightning bolt in slate grey.

Icons: `commit`, `upload`, `pull-request`, `merge`, `shield-check`, `rocket`, `tag`, `package`, `smartphone`, `database`, `play`, `zap`, `globe`, `terminal`, `send`, `trash`, `refresh`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install ship-band --marketplace Azzam/claude-ship-band
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install ship-band --marketplace Azzam/claude-ship-band
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Azzam/claude-ship-band`, then **Add plugin**. A mod installed from a terminal at the user scope also loads in the desktop app's local sessions.

Requires a Claude Code build with mod (function hook) support; this one was built and tested on 2.1.317. The mod API is early access and may change between releases.

## How it works

| Part | What it does |
| --- | --- |
| [`hooks/modes.ts`](hooks/modes.ts) | The built-in modes, the icon set, and the checks every saved mode passes before it is drawn. |
| `offer_actions` tool | `mcp__ship-band__offer_actions`. Claude calls it with up to 6 rows: `kind` (a mode), a `title` naming only the target, a short `detail`. Each call replaces the rows; an empty list clears them. |
| `edit_modes` tool | `mcp__ship-band__edit_modes`. Claude calls it only when you ask to add, change or remove a mode. Modes are kept in the mod's own store. |
| Band | A `ui.render` hook on `AbovePrompt` in [`hooks/register.tsx`](hooks/register.tsx) draws the rows, and gives way to surveys and to an empty list. |
| Yes / No | Yes submits the step as your message; No removes it. Rows live in session state, so they survive a reload of the mod. |

The mod reads no files, runs no commands and makes no network calls. Claude does the work itself, only after your Yes.

## Develop

```bash
claude --plugin-dir ./              # run a session with the mod loaded from this folder
claude plugin validate ./           # manifest, marketplace and hooks module
claude plugin test ./               # tests/band.test.tsx
```

## Credits

Icons from [Lucide](https://lucide.dev) (ISC) and [Feather](https://feathericons.com) (MIT). ship-band is a community mod, not an Anthropic product.

## License

[MIT](LICENSE) © 2026 Azzam
