import { test } from 'node:test'
import assert from 'node:assert/strict'
import { epicSlugFromRefs, normalizeDocsRef, rankCandidates } from '../src/document-source.js'

const DOCS = 'bft/documentation'

test('канонический путь остаётся собой', () => {
  assert.equal(
    normalizeDocsRef('bft/documentation/vibe/vibe.html', DOCS),
    'bft/documentation/vibe/vibe.html',
  )
})

test('префикс имени репозитория снимается — регрессия PO-22', () => {
  // Так пайплайн реально пишет ссылки; из-за этого панель показывала «Документа нет».
  assert.equal(
    normalizeDocsRef('ishmanov-cortex/bft/documentation/vibe/vibe.md', DOCS),
    'bft/documentation/vibe/vibe.md',
  )
})

test('старое имя каталога .bft приводится к актуальному', () => {
  assert.equal(
    normalizeDocsRef('ishmanov-cortex/.bft/documentation/vibe/vibe.html', DOCS),
    'bft/documentation/vibe/vibe.html',
  )
})

test('./ и обратные слэши нормализуются', () => {
  assert.equal(normalizeDocsRef('./bft/documentation/a/b.html', DOCS), 'bft/documentation/a/b.html')
  assert.equal(normalizeDocsRef('bft\\documentation\\a\\b.html', DOCS), 'bft/documentation/a/b.html')
})

test('ссылки вне каталога документов не подхватываются', () => {
  assert.equal(normalizeDocsRef('https://confluence.example.com/x', DOCS), null)
  assert.equal(normalizeDocsRef('okr:strategy-2026q3', DOCS), null)
  assert.equal(normalizeDocsRef('docs/readme.html', DOCS), null)
  assert.equal(normalizeDocsRef('', DOCS), null)
})

test('URL с похожим путём не притворяется локальным файлом', () => {
  assert.equal(normalizeDocsRef('https://example.com/bft/documentation/a/b.html', DOCS), null)
})

test('сегмент сопоставляется целиком, а не подстрокой', () => {
  assert.equal(normalizeDocsRef('other-bft/documentation/a/b.html', DOCS), null)
})

test('сам каталог документов без файла — не ссылка на документ', () => {
  assert.equal(normalizeDocsRef('bft/documentation', DOCS), null)
  assert.equal(normalizeDocsRef('bft/documentation/', DOCS), null)
})

test('slug эпика берётся из любой ссылки внутрь папки, включая .md', () => {
  // У PO-22 в references только .md — HTML не зарегистрирован вовсе.
  const refs = [
    'https://jira.example.com/browse/PROJ-1',
    'ishmanov-cortex/bft/documentation/vibe-kino-user-data/artefacts/validation.md',
  ]
  assert.equal(epicSlugFromRefs(refs, DOCS), 'vibe-kino-user-data')
})

test('без ссылок в каталог документов slug не выдумывается', () => {
  assert.equal(epicSlugFromRefs(['https://confluence.example.com/x'], DOCS), null)
})

test('канонический html предпочитается прочим артефактам', () => {
  const got = rankCandidates('vibe', ['letter.md', 'vibe.md', 'vibe.html'], DOCS)
  assert.deepEqual(got[0], { path: 'bft/documentation/vibe/vibe.html', kind: 'html' })
})

test('FAST-DONE без html показывает письмо и таблицу требований', () => {
  const got = rankCandidates('vibe', ['letter.md', 'requirements.md'], DOCS)
  assert.deepEqual(got.map(c => c.path), [
    'bft/documentation/vibe/letter.md',
    'bft/documentation/vibe/requirements.md',
  ])
  assert.ok(got.every(c => c.kind === 'markdown'))
})

test('html с нестандартным именем тоже находится', () => {
  const got = rankCandidates('vibe', ['renamed.html'], DOCS)
  assert.deepEqual(got, [{ path: 'bft/documentation/vibe/renamed.html', kind: 'html' }])
})

test('пустая папка эпика не даёт кандидатов', () => {
  assert.deepEqual(rankCandidates('vibe', [], DOCS), [])
})

test('дубликатов в списке кандидатов нет', () => {
  const got = rankCandidates('vibe', ['vibe.html'], DOCS)
  assert.equal(got.length, 1)
})
