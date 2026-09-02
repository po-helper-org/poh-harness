import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTaskList } from '../src/parse-list.js'

const STDOUT = `To Do:
  [HIGH] [bft] PO-20 - БФТ: Блокировка мест на схеме зала (спекулянты)
  [MEDIUM] [bft] PO-9 - БФТ: Расширение каталога Ticketland в UMC
  [LOW] [bft] PO-23 - БФТ: Сопровождение Email-интеграции Bartello
  [HIGH] PO-1 - Зарелизить кино на Production
  PO-6 - Актуализировать подзадачи эпика GDSLV-1047

DEEP-WORK:
  [HIGH] [bft] PO-10 - БФТ: Переезд MSSQL -> pgSQL (uat_db, web_db)

In Progress:
  [MEDIUM] PO-4 - Уточнить назначение фонда
`

test('берёт только задачи типа bft', () => {
  const rows = parseTaskList(STDOUT)
  assert.deepEqual(rows.map(r => r.id), ['PO-20', 'PO-9', 'PO-23', 'PO-10'])
})

test('стадию берёт из заголовка группы', () => {
  const rows = parseTaskList(STDOUT)
  assert.equal(rows.find(r => r.id === 'PO-20')?.stage, 'To Do')
  assert.equal(rows.find(r => r.id === 'PO-10')?.stage, 'DEEP-WORK')
})

test('приоритет приводит к нижнему регистру', () => {
  const rows = parseTaskList(STDOUT)
  assert.equal(rows.find(r => r.id === 'PO-20')?.priority, 'high')
  assert.equal(rows.find(r => r.id === 'PO-9')?.priority, 'medium')
  assert.equal(rows.find(r => r.id === 'PO-23')?.priority, 'low')
})

test('название очищено от служебного префикса «БФТ: »', () => {
  const rows = parseTaskList(STDOUT)
  assert.equal(rows.find(r => r.id === 'PO-20')?.title, 'Блокировка мест на схеме зала (спекулянты)')
})

test('группу с неизвестной стадией пропускает целиком', () => {
  const rows = parseTaskList('Archived:\n  [HIGH] [bft] PO-99 - БФТ: Что-то\n')
  assert.deepEqual(rows, [])
})

test('пустой ввод даёт пустой список', () => {
  assert.deepEqual(parseTaskList(''), [])
})

test('CRLF-переводы строк не ломают разбор', () => {
  const rows = parseTaskList('To Do:\r\n  [HIGH] [bft] PO-20 - БФТ: Название\r\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'PO-20')
  assert.equal(rows[0].stage, 'To Do')
  assert.equal(rows[0].title, 'Название')
})

test('BOM в начале вывода не ломает разбор', () => {
  const rows = parseTaskList('﻿To Do:\n  [HIGH] [bft] PO-20 - БФТ: Название\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'PO-20')
})
