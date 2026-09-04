import { normalizeDocsRef } from './document-source.js'
import type { BftLinks } from './model.js'

const EPIC_RE = /^https?:\/\/jira\.mts\.ru\/browse\/[A-Z]+-\d+/

/** Каталог документов по умолчанию — совпадает с `DEFAULTS.docsPath` в config.ts. */
const DEFAULT_DOCS_PATH = 'bft/documentation'

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

function isConfluenceUrl(ref: string): boolean {
  try {
    return new URL(ref).hostname === 'confluence.mts.ru'
  } catch {
    // Не парсится как URL — точно не ссылка на Confluence, идём дальше по цепочке проверок.
    return false
  }
}

/**
 * Раскладывает ссылки из `--ref` по видам.
 * У OKR нет домена — они лежат локально в GROUND/NEXUS/strategy, поэтому
 * единственный надёжный признак это явный префикс `okr:`.
 * Второй и последующие адреса одного вида уходят в `other`, чтобы ничего не пропало.
 */
export function classifyLinks(refs: string[], docsPath: string = DEFAULT_DOCS_PATH): BftLinks {
  const links: BftLinks = { other: [] }

  for (const raw of refs) {
    const ref = raw.trim()
    // Пустая строка — не ссылка, поэтому осознанно выходит за рамки инварианта
    // «ничего не теряется»: она не попадает даже в other.
    if (!ref) continue

    const html = links.html === undefined ? htmlRef(ref, docsPath) : null

    if (links.confluence === undefined && isConfluenceUrl(ref)) {
      links.confluence = ref
    } else if (links.epic === undefined && EPIC_RE.test(ref)) {
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
