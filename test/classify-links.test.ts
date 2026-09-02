import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyLinks } from '../src/classify-links.js'

test('раскладывает ссылки по видам', () => {
  const links = classifyLinks([
    'https://confluence.mts.ru/pages/viewpage.action?pageId=2472119875',
    'https://jira.mts.ru/browse/TLND-19311',
    'okr:strategy-2026q3-kr-1-6',
    '.bft/documentation/vk-tickets-ticketland-widget/vk-tickets-ticketland-widget.html',
  ])
  assert.equal(links.confluence, 'https://confluence.mts.ru/pages/viewpage.action?pageId=2472119875')
  assert.equal(links.epic, 'https://jira.mts.ru/browse/TLND-19311')
  assert.equal(links.okr, 'strategy-2026q3-kr-1-6')
  assert.equal(links.html, '.bft/documentation/vk-tickets-ticketland-widget/vk-tickets-ticketland-widget.html')
  assert.deepEqual(links.other, [])
})

test('нераспознанное не теряет', () => {
  const links = classifyLinks(['https://example.com/whatever', 'просто заметка'])
  assert.deepEqual(links.other, ['https://example.com/whatever', 'просто заметка'])
})

test('префикс okr: снимает', () => {
  assert.equal(classifyLinks(['okr:strategy-2026q3-kr-3-5']).okr, 'strategy-2026q3-kr-3-5')
})

test('html вне .bft/documentation считает прочей ссылкой', () => {
  const links = classifyLinks(['docs/readme.html'])
  assert.equal(links.html, undefined)
  assert.deepEqual(links.other, ['docs/readme.html'])
})

test('при нескольких ссылках одного вида берёт первую', () => {
  const links = classifyLinks([
    'https://jira.mts.ru/browse/TLND-1',
    'https://jira.mts.ru/browse/TLND-2',
  ])
  assert.equal(links.epic, 'https://jira.mts.ru/browse/TLND-1')
  assert.deepEqual(links.other, ['https://jira.mts.ru/browse/TLND-2'])
})

test('пустой список даёт пустую структуру', () => {
  assert.deepEqual(classifyLinks([]), { other: [] })
})
