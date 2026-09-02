import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTaskView } from '../src/parse-view.js'

const FILLED = `File: /Users/x/backlog/tasks/po-15 - БФТ.md

Task PO-15 - БФТ: Перенос ВК Билетов на виджет Ticketland
==================================================

Status: ○ DEEP-DONE
Priority: Medium
Type: bft
Labels: bft-needed
References: https://confluence.mts.ru/pages/viewpage.action?pageId=2472119875, .bft/documentation/vk-tickets-ticketland-widget/vk-tickets-ticketland-widget.html

Description:
--------------------------------------------------
Live перестали поддерживать, виджет отстаёт.

## SMART
К началу Q1 2027 ВК.Билеты работают на виджете Ticketland.

Acceptance Criteria:
--------------------------------------------------
- [ ] #1 Открываем VK
- [x] #2 Жмём «Купить билет»
- [ ] #3 Открывается виджет Ticketland

Definition of Done:
--------------------------------------------------
No Definition of Done items defined
`

const EMPTY = `Task PO-20 - БФТ: Блокировка мест на схеме зала
==================================================

Status: ○ To Do
Priority: High
Type: bft

Description:
--------------------------------------------------
Бесконечная бронь позволяет спекулянтам держать места.

Acceptance Criteria:
--------------------------------------------------
No acceptance criteria defined
`

const CANCELLED = `Task PO-11 - БФТ: AI Harness агент
==================================================

Status: ○ Cancelled
Priority: Low
Type: bft

Description:
--------------------------------------------------
PoC AI-агента.

Implementation Notes:
--------------------------------------------------
Причина: PoC отложен, решили не оформлять БФТ в этом квартале
`

test('читает шапку задачи', () => {
  const t = parseTaskView(FILLED)
  assert.equal(t.id, 'PO-15')
  assert.equal(t.title, 'Перенос ВК Билетов на виджет Ticketland')
  assert.equal(t.stage, 'DEEP-DONE')
  assert.equal(t.priority, 'medium')
})

test('SMART-цель вынимает из секции описания и убирает из описания', () => {
  const t = parseTaskView(FILLED)
  assert.equal(t.smart, 'К началу Q1 2027 ВК.Билеты работают на виджете Ticketland.')
  assert.equal(t.description, 'Live перестали поддерживать, виджет отстаёт.')
})

test('HowToDemo собирает из пунктов приёмки в порядке номеров', () => {
  const t = parseTaskView(FILLED)
  assert.deepEqual(t.howToDemo, [
    'Открываем VK',
    'Жмём «Купить билет»',
    'Открывается виджет Ticketland',
  ])
})

test('ссылки разбирает и раскладывает', () => {
  const t = parseTaskView(FILLED)
  assert.equal(t.links.confluence, 'https://confluence.mts.ru/pages/viewpage.action?pageId=2472119875')
  assert.equal(t.links.html, '.bft/documentation/vk-tickets-ticketland-widget/vk-tickets-ticketland-widget.html')
})

test('пустые секции дают пустые значения, а не падение', () => {
  const t = parseTaskView(EMPTY)
  assert.deepEqual(t.howToDemo, [])
  assert.equal(t.smart, undefined)
  assert.deepEqual(t.links, { other: [] })
  assert.equal(t.description, 'Бесконечная бронь позволяет спекулянтам держать места.')
})

test('причину отмены берёт из заметок', () => {
  const t = parseTaskView(CANCELLED)
  assert.equal(t.stage, 'Cancelled')
  assert.equal(t.cancelReason, 'PoC отложен, решили не оформлять БФТ в этом квартале')
})

test('на мусорном вводе бросает понятную ошибку', () => {
  assert.throws(() => parseTaskView('что-то не то'), /не удалось разобрать задачу/)
})
