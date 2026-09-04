import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardColumns, queueGroups, searchTasks } from '../src/queue.js'
import type { BftTaskSummary } from '../src/model.js'

const TASKS: BftTaskSummary[] = [
  { id: 'PO-9',  title: 'Расширение каталога Ticketland в UMC', stage: 'To Do',       priority: 'medium' },
  { id: 'PO-20', title: 'Блокировка мест на схеме зала',        stage: 'DEEP-REVIEW', priority: 'high' },
  { id: 'PO-10', title: 'Переезд MSSQL на pgSQL',               stage: 'DEEP-WORK',   priority: 'high' },
  { id: 'PO-14', title: 'Доработка СПА с платформы',            stage: 'DEEP-WORK',   priority: 'high' },
  { id: 'PO-8',  title: 'Проблема с фондами',                   stage: 'To Do',       priority: 'high' },
  { id: 'PO-15', title: 'Перенос ВК Билетов',                   stage: 'DEEP-DONE',   priority: 'medium' },
  { id: 'PO-11', title: 'AI Harness агент',                     stage: 'Cancelled',   priority: 'low' },
]

test('очередь идёт от финала к началу и прячет завершённое', () => {
  const groups = queueGroups(TASKS)
  assert.deepEqual(groups.map(g => g.stage), ['DEEP-REVIEW', 'DEEP-WORK', 'To Do'])
})

test('внутри стадии сначала приоритет, потом номер задачи', () => {
  const groups = queueGroups(TASKS)
  assert.deepEqual(groups.find(g => g.stage === 'DEEP-WORK')?.tasks.map(t => t.id), ['PO-10', 'PO-14'])
  assert.deepEqual(groups.find(g => g.stage === 'To Do')?.tasks.map(t => t.id), ['PO-8', 'PO-9'])
})

test('пустых групп в очереди нет', () => {
  const groups = queueGroups([TASKS[0]])
  assert.deepEqual(groups.map(g => g.stage), ['To Do'])
})

test('доска показывает все семь колонок в хронологии, включая пустые', () => {
  const cols = boardColumns(TASKS)
  assert.deepEqual(cols.map(c => c.stage), [
    'To Do', 'FAST-DONE', 'REVIEW-DONE', 'DEEP-WORK', 'DEEP-REVIEW', 'DEEP-DONE', 'Cancelled',
  ])
  assert.deepEqual(cols.find(c => c.stage === 'FAST-DONE')?.tasks, [])
  assert.deepEqual(cols.find(c => c.stage === 'Cancelled')?.tasks.map(t => t.id), ['PO-11'])
})

test('поиск ищет по названию без учёта регистра', () => {
  assert.deepEqual(searchTasks(TASKS, 'каталог').map(t => t.id), ['PO-9'])
  assert.deepEqual(searchTasks(TASKS, 'КАТАЛОГ').map(t => t.id), ['PO-9'])
})

test('поиск ищет по идентификатору задачи', () => {
  assert.deepEqual(searchTasks(TASKS, 'po-20').map(t => t.id), ['PO-20'])
})

test('пустой запрос возвращает всё как есть', () => {
  assert.equal(searchTasks(TASKS, '   ').length, TASKS.length)
})

test('ничего не нашлось — пустой список', () => {
  assert.deepEqual(searchTasks(TASKS, 'зззз'), [])
})

test('поиск находит по заказчику, когда поле есть', () => {
  const full = [
    { id: 'PO-20', title: 'Блокировка мест', stage: 'To Do' as const, priority: 'high' as const,
      customer: 'Кардона Елена (ОПРО)', description: 'Бронь держат спекулянты.',
      howToDemo: [], links: { other: [] } },
    { id: 'PO-13', title: 'Кино на ВТБ Афише', stage: 'To Do' as const, priority: 'low' as const,
      customer: 'Бородин Максим (Коммерция)', description: 'Новый канал продаж.',
      howToDemo: [], links: { other: [] } },
  ]
  assert.deepEqual(searchTasks(full, 'кардона').map(t => t.id), ['PO-20'])
  assert.deepEqual(searchTasks(full, 'коммерция').map(t => t.id), ['PO-13'])
})

test('поиск находит по описанию', () => {
  const full = [
    { id: 'PO-20', title: 'Блокировка мест', stage: 'To Do' as const, priority: 'high' as const,
      customer: 'Кардона Елена', description: 'Бронь держат спекулянты.',
      howToDemo: [], links: { other: [] } },
  ]
  assert.deepEqual(searchTasks(full, 'спекулянт').map(t => t.id), ['PO-20'])
})

test('поиск не падает на строках списка, где заказчика и описания нет', () => {
  assert.deepEqual(searchTasks(TASKS, 'каталог').map(t => t.id), ['PO-9'])
})
