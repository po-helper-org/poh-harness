import type { BftLinks } from './model.js'

const EPIC_RE = /^https?:\/\/jira\.mts\.ru\/browse\/[A-Z]+-\d+/
const HTML_RE = /^\.bft\/documentation\/.+\.html$/

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
    if (!ref) continue

    if (!links.confluence && ref.includes('confluence.mts.ru')) {
      links.confluence = ref
    } else if (!links.epic && EPIC_RE.test(ref)) {
      links.epic = ref
    } else if (!links.okr && ref.startsWith('okr:')) {
      links.okr = ref.slice('okr:'.length)
    } else if (!links.html && HTML_RE.test(ref)) {
      links.html = ref
    } else {
      links.other.push(ref)
    }
  }
  return links
}
