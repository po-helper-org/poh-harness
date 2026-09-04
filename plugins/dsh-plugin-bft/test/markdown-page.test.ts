import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownToPage } from '../src/client/markdown-page.js'

test('заголовки и абзацы превращаются в разметку', () => {
  const page = markdownToPage('# Письмо\n\nЦель: передать данные.', 'letter.md')
  assert.match(page, /<h1>Письмо<\/h1>/)
  assert.match(page, /<p>Цель: передать данные\.<\/p>/)
})

test('таблица требований рендерится как таблица', () => {
  const page = markdownToPage(
    '| ID | ASIS | TOBE |\n|---|---|---|\n| БТ-1 | нет | есть |',
    'requirements.md',
  )
  assert.match(page, /<th>ID<\/th>/)
  assert.match(page, /<td>БТ-1<\/td>/)
  assert.match(page, /<td>есть<\/td>/)
})

test('списки и чекбоксы читаемы', () => {
  const page = markdownToPage('- [ ] не готово\n- [x] готово', 'letter.md')
  assert.match(page, /<li>☐ не готово<\/li>/)
  assert.match(page, /<li>☑ готово<\/li>/)
})

test('нумерованный список остаётся нумерованным', () => {
  const page = markdownToPage('1. первый\n2. второй', 'letter.md')
  assert.match(page, /<ol>/)
  assert.match(page, /<li>первый<\/li>/)
})

test('html из markdown экранируется, а не исполняется', () => {
  // Ключевое свойство: артефакт — данные, а не разметка страницы.
  const page = markdownToPage('<script>alert(1)</script>', 'letter.md')
  assert.ok(!page.includes('<script>alert(1)</script>'))
  assert.match(page, /&lt;script&gt;/)
})

test('заголовок страницы тоже экранируется', () => {
  const page = markdownToPage('текст', '"><script>x</script>')
  assert.ok(!page.includes('<script>x</script>'))
})

test('жирный, курсив и код разбираются', () => {
  const page = markdownToPage('**важно** и *менее* и `код`', 'letter.md')
  assert.match(page, /<strong>важно<\/strong>/)
  assert.match(page, /<em>менее<\/em>/)
  assert.match(page, /<code>код<\/code>/)
})

test('ссылки только http(s); прочие схемы остаются текстом', () => {
  const ok = markdownToPage('[тут](https://jira.mts.ru/browse/X-1)', 'letter.md')
  assert.match(ok, /<a href="https:\/\/jira\.mts\.ru\/browse\/X-1"/)
  const bad = markdownToPage('[клик](javascript:alert(1))', 'letter.md')
  assert.ok(!bad.includes('href="javascript'))
})

test('блок кода не интерпретируется как разметка', () => {
  const page = markdownToPage('```\n# не заголовок\n```', 'letter.md')
  assert.match(page, /<pre><code># не заголовок<\/code><\/pre>/)
})

test('пустой документ даёт валидную страницу', () => {
  const page = markdownToPage('', 'letter.md')
  assert.match(page, /<!doctype html>/)
  assert.match(page, /<\/html>$/)
})
