/**
 * Standalone tsdown config for the browser client bundle, replicating the
 * DeepSeek Harness closure-factory recipe (harness-ui/packages/client/tsdown.client.ts,
 * function clientConfig) for this out-of-tree plugin: the bundle calls
 * window.__ModuleLoader__.load({id, factory}) and resolves externals through
 * the injected require (the shell's loader module table). The node half
 * (lib/index.js) is emitted by tsc, not here — `clean` stays off so this
 * bundle never wipes it. Config structure copied wholesale from the
 * dsh-plugin-subscriptions precedent (out-of-tree tsdown.config.ts); the
 * purity-gate regexes below are re-synced against the live harness instead of
 * that neighbour's copy, which had drifted (see the comment on CLIENT_EXTERNALS).
 */
import { defineConfig } from 'tsdown'

/**
 * Externals answered by the shell's module table — imported normally and left
 * as require() calls in the bundle. Anything else must inline.
 *
 * Sourced from `harness-ui/packages/client/web/src/platform.ts` (`PLATFORM_MODULES`
 * + `PRELOADED_CLIENT_EXTERNALS`, empty in this harness version) — the
 * authority, not the neighbour plugin's own list: dsh-plugin-subscriptions/tsdown.config.ts
 * names two packages that do not exist in this harness (`dsh-client-web-react`,
 * `dsh-client-schema-form`) and omits `@deepseek-ai/dsh-client-store`, which
 * `PLATFORM_MODULES` does include. That list is harmless for that plugin only
 * because it never actually imports the store; copying it here regardless
 * would be a build-time or duplicate-runtime-instance risk the moment this
 * plugin's code imports it.
 */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/**
 * Wire/type layers a client bundle may inline: browser-safe contracts with no
 * runtime identity to share (no Symbol/instanceof/singleton state). Mirrors
 * `harness-ui/packages/client/tsdown.client.ts` (`INLINE_SAFE`) — wider than
 * the neighbour plugin's copy, which only recognized session|llm|tools|brand.
 */
const INLINE_SAFE = /^(?:@deepseek-ai\/dsh-(?:file-reference|session|llm|tools|brand|deque|typert-protocol|util-crypto|util-values|util-workspace-path)(?:\/|$)|@deepseek-ai\/dsh-token-meter\/client$|@deepseek-ai\/dsh-agent-presets\/display$)/

/** Vendored framework libraries: ordinary libraries a browser bundle inlines. */
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/

/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

export default defineConfig({
  name: 'dsh-plugin-bft/client',
  entry: { client: 'src/client/index.tsx' },
  // Single lib/ artifact dir shared with the tsc-emitted node half;
  // entryFileNames pins the bundle at exactly lib/client.js.
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  // Types ship from tsc (lib/client/index.d.ts); dts here would wrap the
  // banner/footer into .d.cts and break parsing.
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (specifier: string) => CLIENT_EXTERNALS.includes(specifier),
    // Anything NOT in the loader module table must inline instead. A
    // require() the table cannot answer is a guaranteed runtime throw.
    alwaysBundle: (specifier: string) => !CLIENT_EXTERNALS.includes(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  plugins: [{
    // Bundle purity gate: platform module-table entries stay external,
    // inline-safe wire layers and vendored libraries inline, and every other
    // @deepseek-ai value import is a build error — it would either inline a
    // duplicate runtime instance or require a specifier the frozen module
    // table cannot answer. Type-only imports are erased and never reach here.
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null // platform module: external wins
      if (VENDORED_LIBRARY.test(source)) return null // vendored library: inline, no shared identity
      if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null // wire contribution: inline is the point
      throw new Error(
        `сторож чистоты: пакет "${source}" не входит ни в CLIENT_EXTERNALS, ни в inline-safe wire-слои, `
        + 'ни в сгенерированные /remote-вклады — value-импорты пакетов харнесса запрещены; '
        + 'сотрудничество идёт через службы cordis (type-only импорты стираются транспайлером и до этой проверки не доходят)',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-plugin-bft", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
