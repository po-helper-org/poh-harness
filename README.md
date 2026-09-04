# dsh-plugin-caveman

Ultra-compressed ("caveman") response style for **every** DSH chat, as one
global system-prompt section.

Style adapted from the [caveman](https://github.com/JuliusBrussee/caveman)
Claude Code plugin by JuliusBrussee, condensed to the rules that work without
its skill-loading machinery.

## Why a section and not a persona

Every shipped agent preset (`standard`, `ptc`, `cordis`) mounts its own
`@deepseek-ai/dsh-persona` row, which registers the `deployment:persona`
section and **shadows** the persona configured on the host `system-prompt` row.
Patching that host persona in a profile patch is therefore silently inert.

A section registered under a *different* name (`style:caveman`) lands in the
global layer, which `dsh-system-prompt` merges into every agent scope. One host
row reaches all presets, and no preset composition has to be forked — a forked
preset would silently fall behind upstream harness-ui updates.

Order `10` places the style right after the persona (`0`) and before
`PLAN_POLICY` (`500`) and every tool guidance block (`>= 1000`).

## Configuration

```yaml
- insert:
    - id: caveman-style
      name: '/абсолютный/путь/dsh-plugin-caveman/src/index.ts'
      config:
        level: ultra
        preserveCodeStyle: true
```

| Field | Default | Meaning |
|---|---|---|
| `level` | `ultra` | `lite` drops filler only; `full` is classic caveman; `ultra` also strips conjunctions where cause and effect stay unambiguous |
| `preserveCodeStyle` | `true` | Keep code, commits, PR descriptions, security warnings, destructive-action confirmations, and multi-step instructions in normal prose |
| `order` | `10` | System-prompt section sort order |

The plugin loads straight from TypeScript source: the harness runs under
`node --import tsx/esm`, and the loader resolves absolute paths in `insert`
rows. No build step.

## Runtime control

The section itself tells the model to honor `/caveman lite|full|ultra` and
"stop caveman" / "normal mode" for the rest of a session, so intensity is
switchable per chat without touching config. Persistent change: edit `level`
in the profile patch.

## Known limitation

The `minimal` preset mounts its persona with `complete: true`, which suppresses
every other prompt section. Chats on `minimal` do not get this style; use the
`caveman` skill there. Every other preset, including the default `standard`, is
covered.
