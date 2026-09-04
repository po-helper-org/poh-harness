import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyLinks } from '../src/classify-links.js'

const HOSTS = { jiraHost: 'jira.example.com', confluenceHost: 'confluence.example.com' }

test('раскладывает ссылки по видам', () => {
  const links = classifyLinks([
    'https://confluence.example.com/pages/viewpage.action?pageId=2472119875',
    'https://jira.example.com/browse/TLND-19311',
    'okr:strategy-2026q3-kr-1-6',
    'bft/documentation/vk-tickets-ticketland-widget/vk-tickets-ticketland-widget.html',
  ], undefined, HOSTS)
  assert.equal(links.confluence, 'https://confluence.example.com/pages/viewpage.action?pageId=2472119875')
  assert.equal(links.epic, 'https://jira.example.com/browse/TLND-19311')
  assert.equal(links.okr, 'strategy-2026q3-kr-1-6')
  assert.equal(links.html, 'bft/documentation/vk-tickets-ticketland-widget/vk-tickets-ticketland-widget.html')
  assert.deepEqual(links.other, [])
})

test('без настроенных хостов эпик и confluence остаются просто ссылками', () => {
  const links = classifyLinks([
    'https://confluence.example.com/pages/viewpage.action?pageId=1',
    'https://jira.example.com/browse/TLND-1',
  ])
  assert.equal(links.confluence, undefined)
  assert.equal(links.epic, undefined)
  assert.deepEqual(links.other, [
    'https://confluence.example.com/pages/viewpage.action?pageId=1',
    'https://jira.example.com/browse/TLND-1',
  ])
})

test('нераспознанное не теряет', () => {
  const links = classifyLinks(['https://example.com/whatever', 'просто заметка'], undefined, HOSTS)
  assert.deepEqual(links.other, ['https://example.com/whatever', 'просто заметка'])
})

test('префикс okr: снимает', () => {
  assert.equal(classifyLinks(['okr:strategy-2026q3-kr-3-5']).okr, 'strategy-2026q3-kr-3-5')
})

test('html вне bft/documentation считает прочей ссылкой', () => {
  const links = classifyLinks(['docs/readme.html'])
  assert.equal(links.html, undefined)
  assert.deepEqual(links.other, ['docs/readme.html'])
})

test('при нескольких ссылках одного вида берёт первую', () => {
  const links = classifyLinks([
    'https://jira.example.com/browse/TLND-1',
    'https://jira.example.com/browse/TLND-2',
  ], undefined, HOSTS)
  assert.equal(links.epic, 'https://jira.example.com/browse/TLND-1')
  assert.deepEqual(links.other, ['https://jira.example.com/browse/TLND-2'])
})

test('пустой список даёт пустую структуру', () => {
  assert.deepEqual(classifyLinks([]), { other: [] })
})

test('confluence распознаётся по домену, а не по подстроке', () => {
  const links = classifyLinks(['https://evil.example.com/?u=confluence.example.com'], undefined, HOSTS)
  assert.equal(links.confluence, undefined)
  assert.deepEqual(links.other, ['https://evil.example.com/?u=confluence.example.com'])
})

test('пустое значение okr: не теряет первую ссылку', () => {
  const links = classifyLinks(['okr:', 'okr:strategy-2026q3-kr-1-6'])
  assert.equal(links.okr, '')
  assert.deepEqual(links.other, ['okr:strategy-2026q3-kr-1-6'])
})

test('пустая строка отбрасывается и не попадает в other', () => {
  const links = classifyLinks(['   ', 'okr:strategy-2026q3-kr-1-6'])
  assert.equal(links.okr, 'strategy-2026q3-kr-1-6')
  assert.deepEqual(links.other, [])
})

test('html распознаётся независимо от регистра расширения', () => {
  const links = classifyLinks(['bft/documentation/x/y.HTML'])
  assert.equal(links.html, 'bft/documentation/x/y.HTML')
  assert.deepEqual(links.other, [])
})
