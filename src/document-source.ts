/**
 * Поиск документа требования по конвенции каталогов, а не по точной строке в `--ref`.
 *
 * Зачем отдельный слой: раньше панель показывала документ, только если навык (bft-fast /
 * bft-deep / bft-writer) записал ссылку ровно в форме `bft/documentation/<slug>/<slug>.html`.
 * Любое расхождение — префикс репозитория (`ishmanov-cortex/...`), переименование каталога
 * (`.bft` → `bft`), забытый `--ref` на сгенерированный HTML — и страница молча показывала
 * «Документа нет», хотя файл лежал на диске. То есть обновление навыка ломало DSH.
 *
 * Инверсия зависимости: навык волен писать ссылки как ему удобно (и вовсе их не писать) —
 * DSH сам находит артефакты в каталоге эпика. От ссылок нужен только один факт: в какой
 * папке эпика лежит требование. Его даёт ЛЮБАЯ ссылка внутрь `docsPath`, включая `.md`,
 * поэтому связка переживает и отсутствие HTML в ссылках.
 */

/** Имя каталога эпика + порядок предпочтения артефактов внутри него. */
export interface DocumentCandidate {
  /** Путь относительно корня воркспейса — в таком виде его читает reader. */
  path: string
  /** `html` показывается как есть; `markdown` перед показом заворачивается в страницу. */
  kind: 'html' | 'markdown'
}

/**
 * Приводит ссылку к пути относительно корня воркспейса и проверяет, что она ведёт внутрь
 * каталога документов. Возвращает `null`, если ссылка ведёт куда-то ещё (URL, заметка, файл
 * вне `docsPath`) — такую ссылку не за что зацепить.
 *
 * Терпимость намеренная и ограниченная: снимаются только те расхождения, которые реально
 * порождает пайплайн, и ни одно из них не расширяет доступ за пределы `docsPath` — итоговый
 * путь всё равно обязан начинаться с него, а проверку выхода наружу делает reader.
 */
export function normalizeDocsRef(ref: string, docsPath: string): string | null {
  let value = ref.trim().replace(/\\/g, '/')
  if (value === '') return null

  // URL — не путь в воркспейсе. Отсекаем до нормализации, чтобы `https://host/bft/...`
  // не притворился локальным путём после снятия префиксов.
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) || value.startsWith('okr:')) return null

  value = value.replace(/^\.\//, '')

  const docs = docsPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
  // Каталог документов переименовывали (`.bft` → `bft`), и в задачах остались ссылки обеих
  // форм. Сопоставляем по варианту без ведущей точки, а возвращаем всегда актуальный `docs`.
  const docsAlt = docs.startsWith('.') ? docs.slice(1) : `.${docs}`

  for (const prefix of [docs, docsAlt]) {
    const at = indexOfSegment(value, prefix)
    if (at === -1) continue
    const tail = value.slice(at + prefix.length).replace(/^\/+/, '')
    if (tail === '') return null
    return `${docs}/${tail}`
  }
  return null
}

/** Ищет `needle` как целую последовательность сегментов пути, а не как подстроку. */
function indexOfSegment(value: string, needle: string): number {
  if (needle === '') return -1
  let from = 0
  for (;;) {
    const at = value.indexOf(needle, from)
    if (at === -1) return -1
    const before = at === 0 ? '/' : value[at - 1]
    const afterAt = at + needle.length
    const after = afterAt >= value.length ? '/' : value[afterAt]
    if (before === '/' && after === '/') return at
    from = at + 1
  }
}

/**
 * Имя каталога эпика из любых ссылок задачи. Берётся первый сегмент после `docsPath`,
 * поэтому годится ссылка на что угодно внутри папки эпика — `letter.md`, `requirements.md`,
 * `artefacts/validation.md` — а не только на сам документ.
 */
export function epicSlugFromRefs(refs: readonly string[], docsPath: string): string | null {
  for (const ref of refs) {
    const normalized = normalizeDocsRef(ref, docsPath)
    if (normalized === null) continue
    const docs = docsPath.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
    const slug = normalized.slice(docs.length + 1).split('/')[0]
    if (slug && slug !== '.' && slug !== '..') return slug
  }
  return null
}

/**
 * Порядок предпочтения артефактов в папке эпика.
 *
 * Сначала канонический `<slug>.html` — это финальный документ, который рендерит bft-writer.
 * Затем любой другой `.html` (эпик могли назвать иначе). Затем markdown: `<slug>.md` —
 * тот же документ до рендера, `letter.md` и `requirements.md` — то, что реально производит
 * быстрый проход `/bft-fast`, у которого HTML не бывает вовсе. Благодаря последнему на
 * стадии FAST-DONE страница показывает письмо и таблицу требований, а не пустой экран.
 */
export function rankCandidates(slug: string, entries: readonly string[], docsPath: string): DocumentCandidate[] {
  const docs = docsPath.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')
  const dir = `${docs}/${slug}`
  const has = (name: string) => entries.includes(name)
  const out: DocumentCandidate[] = []
  const push = (name: string, kind: DocumentCandidate['kind']) => {
    const path = `${dir}/${name}`
    if (!out.some(c => c.path === path)) out.push({ path, kind })
  }

  if (has(`${slug}.html`)) push(`${slug}.html`, 'html')
  for (const name of entries.filter(n => n.toLowerCase().endsWith('.html')).sort()) push(name, 'html')
  if (has(`${slug}.md`)) push(`${slug}.md`, 'markdown')
  for (const name of ['letter.md', 'requirements.md']) if (has(name)) push(name, 'markdown')
  return out
}
