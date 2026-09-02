import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CANON_ORDER, QUEUE_ORDER, HIDDEN_IN_QUEUE } from '../src/model.js'

test('канонический порядок стадий — хронологический', () => {
  assert.deepEqual(CANON_ORDER, [
    'To Do',
    'FAST-DONE',
    'REVIEW-DONE',
    'DEEP-WORK',
    'DEEP-REVIEW',
    'DEEP-DONE',
    'Cancelled',
  ])
})

test('очередь идёт от финала к началу', () => {
  assert.deepEqual(QUEUE_ORDER, [
    'DEEP-REVIEW',
    'DEEP-WORK',
    'REVIEW-DONE',
    'FAST-DONE',
    'To Do',
  ])
})

test('готовое и отменённое в очереди не показываем', () => {
  assert.deepEqual([...HIDDEN_IN_QUEUE].sort(), ['Cancelled', 'DEEP-DONE'])
})
