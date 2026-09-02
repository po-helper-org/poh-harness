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

test('CRLF-переводы строк не ломают разбор', () => {
  const t = parseTaskView(FILLED.replace(/\n/g, '\r\n'))
  assert.equal(t.id, 'PO-15')
  assert.equal(t.stage, 'DEEP-DONE')
  assert.equal(t.description, 'Live перестали поддерживать, виджет отстаёт.')
  assert.equal(t.smart, 'К началу Q1 2027 ВК.Билеты работают на виджете Ticketland.')
  assert.deepEqual(t.howToDemo, [
    'Открываем VK',
    'Жмём «Купить билет»',
    'Открывается виджет Ticketland',
  ])
})

test('CRLF в отменённой задаче: причина отмены не теряется', () => {
  const t = parseTaskView(CANCELLED.replace(/\n/g, '\r\n'))
  assert.equal(t.stage, 'Cancelled')
  assert.equal(t.cancelReason, 'PoC отложен, решили не оформлять БФТ в этом квартале')
})

test('BOM в начале вывода не ломает разбор', () => {
  const t = parseTaskView('﻿' + EMPTY)
  assert.equal(t.id, 'PO-20')
  assert.equal(t.title, 'Блокировка мест на схеме зала')
})

test('cancelReason заполняется только у стадии Cancelled', () => {
  const DEEP_WORK_WITH_NOTES = `Task PO-30 - БФТ: Схема согласования БД
==================================================

Status: ○ DEEP-WORK
Priority: High
Type: bft

Description:
--------------------------------------------------
Нужна схема согласования изменений в БД.

Implementation Notes:
--------------------------------------------------
- Собрал контекст по схемам
- TODO: дождаться ответа DBA
`
  const t = parseTaskView(DEEP_WORK_WITH_NOTES)
  assert.equal(t.stage, 'DEEP-WORK')
  assert.equal(t.cancelReason, undefined)
})

test('приоритет вне словаря приводится к medium', () => {
  const UNKNOWN_PRIORITY = `Task PO-31 - БФТ: Что-то
==================================================

Status: ○ To Do
Priority: Critical
Type: bft

Description:
--------------------------------------------------
Описание.
`
  const t = parseTaskView(UNKNOWN_PRIORITY)
  assert.equal(t.priority, 'medium')
})

test('## SMART ищется только как отдельная строка-заголовок', () => {
  const SMART_MID_SENTENCE = `Task PO-32 - БФТ: Что-то
==================================================

Status: ○ To Do
Priority: Medium
Type: bft

Description:
--------------------------------------------------
Обсуждали, что ## SMART заполняем позже.
`
  const t = parseTaskView(SMART_MID_SENTENCE)
  assert.equal(t.description, 'Обсуждали, что ## SMART заполняем позже.')
  assert.equal(t.smart, undefined)
})

test('заказчик вынимается из префикса описания и убирается из него', () => {
  const t = parseTaskView(`Task PO-20 - БФТ: Блокировка мест
==========

Status: ○ To Do
Priority: High
Type: bft

Description:
--------------------------------------------------
Заказчик: Кардона Елена (ОПРО). Бесконечная бронь позволяет спекулянтам держать места.
`)
  assert.equal(t.customer, 'Кардона Елена (ОПРО)')
  assert.equal(t.description, 'Бесконечная бронь позволяет спекулянтам держать места.')
})

test('заказчик с косой чертой в имени разбирается целиком', () => {
  const t = parseTaskView(`Task PO-11 - БФТ: Агент
==========

Status: ○ To Do
Priority: Low
Type: bft

Description:
--------------------------------------------------
Заказчик: Николаев Данила / Романов Василий (Engineering). PoC AI-агента.
`)
  assert.equal(t.customer, 'Николаев Данила / Романов Василий (Engineering)')
  assert.equal(t.description, 'PoC AI-агента.')
})

test('описание без префикса заказчика остаётся нетронутым', () => {
  const t = parseTaskView(`Task PO-13 - БФТ: Кино
==========

Status: ○ To Do
Priority: Medium
Type: bft

Description:
--------------------------------------------------
Партнёр хочет продавать билеты в кино.
`)
  assert.equal(t.customer, undefined)
  assert.equal(t.description, 'Партнёр хочет продавать билеты в кино.')
})
