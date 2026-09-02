import type { BftLinks } from './model.js'

const EPIC_RE = /^https?:\/\/jira\.mts\.ru\/browse\/[A-Z]+-\d+/
const HTML_RE = /^\.bft\/documentation\/.+\.html$/i

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
export function classifyLinks(refs: string[]): BftLinks {
  const links: BftLinks = { other: [] }

  for (const raw of refs) {
    const ref = raw.trim()
    // Пустая строка — не ссылка, поэтому осознанно выходит за рамки инварианта
    // «ничего не теряется»: она не попадает даже в other.
    if (!ref) continue

    if (links.confluence === undefined && isConfluenceUrl(ref)) {
      links.confluence = ref
    } else if (links.epic === undefined && EPIC_RE.test(ref)) {
      links.epic = ref
    } else if (links.okr === undefined && ref.startsWith('okr:')) {
      links.okr = ref.slice('okr:'.length)
    } else if (links.html === undefined && HTML_RE.test(ref)) {
      links.html = ref
    } else {
      links.other.push(ref)
    }
  }
  return links
}
