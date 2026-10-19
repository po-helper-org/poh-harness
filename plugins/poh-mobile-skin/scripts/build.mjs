/**
 * Сборка poh-mobile-skin: tsc для типизи­руемой серверной половины + ручная
 * конвертация клиентской в closure-factory формат харнесса
 * (window.__ModuleLoader__.load({id, factory})) — по образцу bft-бандла,
 * но без tsdown: клиент этого плагина не использует React/JSX и внешние
 * платформенные модули, поэтому достаточно тонкой обёртки над esbuild-выходом
 * не нужно — пишем factory напрямую из скомпилированного ESM тривиальным
 * преобразованием (один export function apply).
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('lib/client', { recursive: true })

// 1) серверная половина: index.ts -> lib/index.js (ESM)
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  format: 'esm',
  target: 'node22',
  bundle: false,
})

// 2) клиентская: index.ts -> lib/client.js в формате closure-factory.
//    Внешних require нет (кроме типов), поэтому factory не требует таблицы.
const r = await build({
  entryPoints: ['src/client/index.ts'],
  write: false,
  format: 'esm',
  target: 'es2022',
  minify: false,
})
let code = r.outputFiles[0].text
// esbuild может оставить хвостовой `export { ... }` (реэкспорт типов) — вырезаем:
// внутри factory это синтаксическая ошибка, клиенты харнесса — CJS-подобные.
code = code.replace(/export function apply/, 'function apply')
code = code.replace(/^export \{[^}]*\}\s*;?\s*$/gm, '')
code = code.replace(/^export \{[\s\S]*?\}\s*$/m, '')
code += '\nexports.apply = apply;\n'
const wrapped = `window.__ModuleLoader__.load({\n  id: "poh-mobile-skin",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n${code
  .split('\n')
  .map(l => (l ? '  ' + l : l))
  .join('\n')}\n    return module.exports;\n  },\n})\n`
writeFileSync('lib/client.js', wrapped)
writeFileSync(
  'lib/client/index.d.ts',
  "import type { Context as ClientContext } from '@deepseek-ai/cordis'\nexport declare function apply(ctx: ClientContext): void\n",
)
console.log('poh-mobile-skin built')
