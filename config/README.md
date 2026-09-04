# Local MCP tool servers for the `web` profile

Workspace-local MCP bridges for this checkout. Each `*.cordis.yml` here is the
source of truth and rationale for one row that is mirrored into the live profile
patch layer at
`../../harness-ui/.dsh-data/profiles/web/cordis.patch.yml`. Keep the two in sync.

Nothing here is global: `~/.dsh` is untouched.

## How this works

DSH ships a generic MCP bridge, `@deepseek-ai/dsh-mcp-client`. One config row per
server is the whole setup — no custom plugin. DSH connects, discovers the
server's tools, and exposes them to the model as `mcp__<serverName>__<tool>`.

DSH only connects. It does not install the server, manage its data, or supervise
an HTTP service. For `stdio` it starts and stops the child process with the
plugin lifecycle; for `streamable-http` the upstream service must already be
running.

## Configured servers

| Server | `serverName` | Transport | Prerequisite |
|---|---|---|---|
| [Backlog.md](https://github.com/MrLesk/Backlog.md) | `backlog` | stdio | `backlog` on PATH (`brew install backlog-md`) |
| [Context7](https://context7.com) | `context7` | streamable-http | network access; no API key at the default rate limit |

## Applying a change

The `web` profile is declared `patchReload: live` in
`.dsh-data/profiles/web/package.json`, so edits to `cordis.patch.yml` are picked
up by the running Host through the launcher's watch-only fallback — the disabled
`hmr` row in the base bundle is not required for this.

Tool discovery is asynchronous, and an already-open session keeps the tool
catalog it started with. Open a **new session** before expecting a newly added
`mcp__...` tool. A Host restart is not required.

A failed initial connection is not fatal: the Host still boots and simply lists
no tools for that server (`failOnStartupError` defaults to `false`). A crashed
child reconnects with backoff.

## Adding another server

Copy an existing row, and give it an `id` and a `serverName` that are both
unique — two rows sharing a `serverName` make the later one fail to load. The
name must match `[A-Za-z0-9_-]{1,32}`.

Validate a row against the plugin's real schema before relying on it:

```sh
cd ../../harness-ui
node --input-type=module -e "
import yaml from 'js-yaml'; import fs from 'node:fs';
const { Config } = await import('./packages/mcp/mcp-client/lib/index.js');
const d = yaml.load(fs.readFileSync('.dsh-data/profiles/web/cordis.patch.yml','utf8'));
for (const e of d) for (const r of (e.insert ?? [])) {
  try { const o = Config(r.config); console.log('OK  ', r.id, o.serverName, o.transport) }
  catch (err) { console.log('FAIL', r.id, err.message) }
}"
```

`Config` is a schemastery schema: call it, do not use `.parse()`.

Never put a credential in these files. Read it from the environment instead:

```yaml
headers:
  Authorization: !!js '`Bearer ${process.env.SOME_TOKEN}`'
```

The generated [configuration catalog](../../harness-ui/docs/config-catalog.md#deepseek-aidsh-mcp-client)
lists every accepted field, and
[`packages/mcp/mcp-client/README.md`](../../harness-ui/packages/mcp/mcp-client/README.md)
is the package contract.
