/**
 * Тестовый стенд poh-mobile-skin: разметка как у dsh + НАСТОЯЩИЙ CSS dsh +
 * собранный скин, без живого харнесса и без входа.
 *
 *   pnpm build && pnpm stand          # http://127.0.0.1:8765/fixture.html
 *   PORT=9000 pnpm stand
 *
 * Откройте страницу в мобильном размере (iPhone 15 Pro — 393×852) и
 * добавьте ?autorun — отчёт проверок появится внизу; ?remount — худший случай,
 * когда dsh пересоздаёт модалку настроек при смене раздела.
 *
 * CSS берётся из пакетов @deepseek-ai/dsh-client-ui-* той версии dsh, что
 * запинена в корневом package.json: после обновления харнесса стенд сразу
 * покажет, какие хэш-классы разъехались.
 */
import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..')
const repoRoot = join(pluginRoot, '..', '..')
const pnpmDir = join(repoRoot, 'node_modules', '.pnpm')

const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).dependencies['@deepseek-ai/dsh']
const PACKAGES = ['ui-layout', 'ui-sidebar', 'ui-conversation', 'ui-settings-general', 'ui-workspace']

function extractCss() {
  if (!existsSync(pnpmDir)) throw new Error(`нет ${pnpmDir} — сначала ./install.sh`)
  const dirs = readdirSync(pnpmDir)
  const chunks = []
  for (const p of PACKAGES) {
    const name = `dsh-client-${p}`
    const dir = dirs.find(d => d.startsWith(`@deepseek-ai+${name}@${version}_`))
    if (!dir) throw new Error(`не найден @deepseek-ai/${name}@${version} в node_modules/.pnpm`)
    const src = readFileSync(join(pnpmDir, dir, 'node_modules', '@deepseek-ai', name, 'lib', 'client.js'), 'utf8')
    for (const m of src.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)) chunks.push(JSON.parse(m[1]))
  }
  return chunks.join('\n')
}

const bundle = join(pluginRoot, 'lib', 'client.js')
if (!existsSync(bundle)) {
  console.error('нет lib/client.js — сначала pnpm build')
  process.exit(1)
}

const css = extractCss()
const routes = {
  '/fixture.html': () => [readFileSync(join(here, 'fixture.html')), 'text/html; charset=utf-8'],
  '/dsh.css': () => [css, 'text/css; charset=utf-8'],
  '/client.js': () => [readFileSync(bundle), 'text/javascript; charset=utf-8'],
}

const port = Number(process.env.PORT ?? 8765)
createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  const route = routes[path === '/' ? '/fixture.html' : path]
  if (!route) { res.writeHead(404).end(); return }
  const [body, type] = route()
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body)
}).listen(port, '127.0.0.1', () => {
  console.log(`dsh ${version}: CSS ${Math.round(css.length / 1024)} КБ из ${PACKAGES.length} пакетов`)
  console.log(`стенд: http://127.0.0.1:${port}/fixture.html?autorun  (режим пересоздания: &remount)`)
})
