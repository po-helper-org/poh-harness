import { normalizeDocsRef } from './document-source.js'
import type { BftLinks } from './model.js'

/** Каталог документов по умолчанию — совпадает с `DEFAULTS.docsPath` в config.ts. */
const DEFAULT_DOCS_PATH = 'bft/documentation'

/**
 * Хосты трекера/вики, по которым распознаются эпик- и Confluence-ссылки.
 * Хост не задан (нет `JIRA_HOST`/`CONFLUENCE_HOST` в окружении) — соответствующий
 * вид не распознаётся вовсе, ссылка остаётся в `other`: ничего не угадывается по
 * захардкоженному домену конкретного развёртывания.
 */
export interface LinkHosts {
  jiraHost?: string
  confluenceHost?: string
}

/**
 * Ссылка на HTML-документ требования — любая, ведущая внутрь каталога документов.
 * Раньше здесь была жёсткая регулярка `^bft/documentation/....html`, и ссылка с префиксом
 * репозитория (`ishmanov-cortex/bft/...`) или со старым именем каталога (`.bft/...`) молча
 * уходила в `other`, из-за чего документ не показывался. Нормализация снимает эту хрупкость:
 * путь приводится к каноничному виду, и он же уезжает в `links.html`, чтобы читатель мог
 * открыть файл без дополнительных догадок.
 */
function htmlRef(ref: string, docsPath: string): string | null {
  const normalized = normalizeDocsRef(ref, docsPath)
  if (normalized === null || !normalized.toLowerCase().endsWith('.html')) return null
  return normalized
}

function hostnameOf(ref: string): string | undefined {
  try {
    return new URL(ref).hostname
  } catch {
    // Не парсится как URL — точно не ссылка, идём дальше по цепочке проверок.
    return undefined
  }
}

function isEpicUrl(ref: string, jiraHost: string | undefined): boolean {
  return jiraHost !== undefined && hostnameOf(ref) === jiraHost && /\/browse\/[A-Z]+-\d+/.test(ref)
}

function isConfluenceUrl(ref: string, confluenceHost: string | undefined): boolean {
  return confluenceHost !== undefined && hostnameOf(ref) === confluenceHost
}

/**
 * Раскладывает ссылки из `--ref` по видам.
 * У OKR нет домена — они лежат локально в GROUND/NEXUS/strategy, поэтому
 * единственный надёжный признак это явный префикс `okr:`. Эпик и Confluence
 * распознаются по хосту из `hosts` (те же значения, что `BftConfig.jira.baseUrl` /
 * `confluence.baseUrl`); хост не настроен — вид не распознаётся.
 * Второй и последующие адреса одного вида уходят в `other`, чтобы ничего не пропало.
 */
export function classifyLinks(
  refs: string[],
  docsPath: string = DEFAULT_DOCS_PATH,
  hosts: LinkHosts = {},
): BftLinks {
  const links: BftLinks = { other: [] }

  for (const raw of refs) {
    const ref = raw.trim()
    // Пустая строка — не ссылка, поэтому осознанно выходит за рамки инварианта
    // «ничего не теряется»: она не попадает даже в other.
    if (!ref) continue

    const html = links.html === undefined ? htmlRef(ref, docsPath) : null

    if (links.confluence === undefined && isConfluenceUrl(ref, hosts.confluenceHost)) {
      links.confluence = ref
    } else if (links.epic === undefined && isEpicUrl(ref, hosts.jiraHost)) {
      links.epic = ref
    } else if (links.okr === undefined && ref.startsWith('okr:')) {
      links.okr = ref.slice('okr:'.length)
    } else if (html !== null) {
      links.html = html
      // Исходную ссылку не теряем, если нормализация её изменила: в `other` остаётся то,
      // что реально написано в задаче — это важно для диагностики расхождений с навыком.
      if (html !== ref) links.other.push(ref)
    } else {
      links.other.push(ref)
    }
  }
  return links
}
