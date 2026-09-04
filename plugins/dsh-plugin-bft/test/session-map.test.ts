import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  forgetRequirementSession, readRequirementSession, writeRequirementSession,
} from '../src/client/session-map.js'

/**
 * Минимальная подделка localStorage: модуль ходит только в getItem/setItem, и вся его
 * защита построена на том, что любой сбой хранилища — это «карты нет», а не исключение
 * наружу. Поэтому подделка умеет ещё и ломаться по требованию (см. тесты ниже).
 */
class FakeStorage {
  private data = new Map<string, string>()
  /** Когда true — обе операции бросают, как в приватном режиме или при исчерпанной квоте. */
  throwing = false

  getItem(key: string): string | null {
    if (this.throwing) throw new Error('storage unavailable')
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.throwing) throw new Error('quota exceeded')
    this.data.set(key, value)
  }

  /** Прямая запись мимо модуля — так тесты подкладывают заведомо битое содержимое. */
  seed(key: string, value: string): void { this.data.set(key, value) }
}

let storage: FakeStorage

beforeEach(() => {
  storage = new FakeStorage()
  ;(globalThis as unknown as { localStorage: FakeStorage }).localStorage = storage
})

const KEY = 'dsh-plugin-bft:mini-chat-sessions:v1'

test('сессия, закреплённая за требованием, читается обратно', () => {
  writeRequirementSession('PO-22', 'session-abc')
  assert.equal(readRequirementSession('PO-22'), 'session-abc')
})

test('у требования без закреплённой сессии её нет', () => {
  assert.equal(readRequirementSession('PO-22'), undefined)
})

test('требования не делят сессию между собой', () => {
  writeRequirementSession('PO-22', 'session-a')
  writeRequirementSession('PO-20', 'session-b')
  assert.equal(readRequirementSession('PO-22'), 'session-a')
  assert.equal(readRequirementSession('PO-20'), 'session-b')
})

test('повторная привязка заменяет прежнюю', () => {
  writeRequirementSession('PO-22', 'session-old')
  writeRequirementSession('PO-22', 'session-new')
  assert.equal(readRequirementSession('PO-22'), 'session-new')
})

test('забытая привязка исчезает, соседние остаются', () => {
  writeRequirementSession('PO-22', 'session-a')
  writeRequirementSession('PO-20', 'session-b')
  forgetRequirementSession('PO-22')
  assert.equal(readRequirementSession('PO-22'), undefined)
  assert.equal(readRequirementSession('PO-20'), 'session-b')
})

test('забыть отсутствующую привязку — не ошибка', () => {
  assert.doesNotThrow(() => { forgetRequirementSession('PO-404') })
})

test('битый JSON читается как пустая карта, а не роняет мини-чат', () => {
  storage.seed(KEY, '{ это не json')
  assert.equal(readRequirementSession('PO-22'), undefined)
})

test('JSON правильной грамматики, но не объект, игнорируется', () => {
  // Массив и строка — валидный JSON, но карте не соответствуют: доверять их форме нельзя.
  storage.seed(KEY, '["session-a"]')
  assert.equal(readRequirementSession('PO-22'), undefined)
  storage.seed(KEY, '"session-a"')
  assert.equal(readRequirementSession('PO-22'), undefined)
})

test('одна битая запись не обесценивает остальную карту', () => {
  storage.seed(KEY, JSON.stringify({ 'PO-22': 42, 'PO-20': 'session-b', 'PO-19': '' }))
  assert.equal(readRequirementSession('PO-22'), undefined, 'нестроковое значение отброшено')
  assert.equal(readRequirementSession('PO-19'), undefined, 'пустая строка — не идентификатор')
  assert.equal(readRequirementSession('PO-20'), 'session-b', 'годная запись уцелела')
})

test('недоступное хранилище выглядит как отсутствие карты, а не как исключение', () => {
  storage.throwing = true
  assert.equal(readRequirementSession('PO-22'), undefined)
  assert.doesNotThrow(() => { writeRequirementSession('PO-22', 'session-a') })
  assert.doesNotThrow(() => { forgetRequirementSession('PO-22') })
})
