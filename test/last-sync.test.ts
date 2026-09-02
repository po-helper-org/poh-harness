import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLastSync } from '../src/last-sync.js'

const GOOD = JSON.stringify({
  at: '2026-09-02T17:32:00Z',
  checkedRows: 41,
  created: ['PO-7', 'PO-8'],
  promoted: ['PO-12'],
  needsAttention: ['PO-9'],
})

test('читает корректную метку', () => {
  const s = parseLastSync(GOOD)
  assert.equal(s?.at, '2026-09-02T17:32:00Z')
  assert.equal(s?.checkedRows, 41)
  assert.deepEqual(s?.created, ['PO-7', 'PO-8'])
  assert.deepEqual(s?.promoted, ['PO-12'])
  assert.deepEqual(s?.needsAttention, ['PO-9'])
})

test('файла нет — возвращает null', () => {
  assert.equal(parseLastSync(null), null)
})

test('битый JSON — возвращает null, не бросает', () => {
  assert.equal(parseLastSync('{не json'), null)
})

test('нет обязательного поля времени — возвращает null', () => {
  assert.equal(parseLastSync(JSON.stringify({ checkedRows: 1 })), null)
})

test('отсутствующие списки заменяет пустыми', () => {
  const s = parseLastSync(JSON.stringify({ at: '2026-09-02T17:32:00Z' }))
  assert.equal(s?.checkedRows, 0)
  assert.deepEqual(s?.created, [])
  assert.deepEqual(s?.promoted, [])
  assert.deepEqual(s?.needsAttention, [])
})

test('поле не того типа игнорирует и подставляет пустое', () => {
  const s = parseLastSync(JSON.stringify({ at: '2026-09-02T17:32:00Z', created: 'PO-7' }))
  assert.deepEqual(s?.created, [])
})
