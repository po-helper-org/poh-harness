import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BFT_CHANNEL, dispatch } from '../src/channel.js'
import { BacklogReader } from '../src/reader.js'
import type { BftConfig } from '../src/config.js'

const CONFIG: BftConfig = {
  workspaceRoot: '/w',
  backlogBin: 'backlog',
  docsPath: 'bft/documentation',
  indexPath: 'bft/index',
  sessionPath: 'bft',
  taskType: 'bft',
  teamName: 'PO team',
  jira: { baseUrl: 'https://jira.example.com' },
  confluence: { baseUrl: 'https://confluence.example.com' },
}

const LIST = `To Do:
  [HIGH] [bft] PO-20 - БФТ: Блокировка мест на схеме зала
`

const VIEW = `Task PO-20 - БФТ: Блокировка мест на схеме зала
==========

Status: ○ To Do
Priority: High
Type: bft

Description:
--------------------------------------------------
Заказчик: Кардона Елена (ОПРО). Бесконечная бронь.
`

function readerWith(stdout: string, readTextFile: () => Promise<string | null> = async () => null) {
  return new BacklogReader(CONFIG, {
    runCommand: async () => ({ stdout, stderr: '', code: 0, timedOut: false, killedBySignal: null }),
    readTextFile,
  })
}

const NO_SIGNAL = new AbortController().signal

test('имя канала зафиксировано', () => {
  assert.equal(BFT_CHANNEL, '/bft')
})

test('list отдаёт список требований', async () => {
  const result = await dispatch(readerWith(LIST), 'list', {}, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.deepEqual((result as { value: Array<{ id: string }> }).value.map(t => t.id), ['PO-20'])
})

test('task отдаёт карточку требования', async () => {
  const result = await dispatch(readerWith(VIEW), 'task', { id: 'PO-20' }, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.equal((result as { value: { customer?: string } }).value.customer, 'Кардона Елена (ОПРО)')
})

test('document отдаёт содержимое документа', async () => {
  const reader = readerWith('', async () => '<html>документ</html>')
  const result = await dispatch(reader, 'document', { path: 'bft/documentation/x/y.html' }, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.equal((result as { value: string }).value, '<html>документ</html>')
})

test('lastSync отдаёт null, когда метки нет', async () => {
  const result = await dispatch(readerWith(''), 'lastSync', {}, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.equal((result as { value: unknown }).value, null)
})

test('неизвестная подкоманда даёт bad-request', async () => {
  const result = await dispatch(readerWith(''), 'нет-такой', {}, NO_SIGNAL)
  assert.equal(result.ok, false)
  assert.equal((result as { error: { code: string } }).error.code, 'bad-request')
})

test('task без идентификатора даёт bad-request', async () => {
  const result = await dispatch(readerWith(VIEW), 'task', {}, NO_SIGNAL)
  assert.equal(result.ok, false)
  assert.equal((result as { error: { code: string } }).error.code, 'bad-request')
})

test('невалидный идентификатор отображается в свой код', async () => {
  const result = await dispatch(readerWith(VIEW), 'task', { id: '--help' }, NO_SIGNAL)
  assert.equal(result.ok, false)
  assert.equal((result as { error: { code: string } }).error.code, 'invalid-task-id')
})

test('отсутствие CLI отображается в свой код и сохраняет подсказку', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({ stdout: '', stderr: 'spawn ENOENT', code: -1, timedOut: false, killedBySignal: null }),
  })
  const result = await dispatch(reader, 'list', {}, NO_SIGNAL)
  assert.equal(result.ok, false)
  const error = (result as { error: { code: string; message: string } }).error
  assert.equal(error.code, 'backlog-unavailable')
  assert.match(error.message, /brew install backlog-md/)
})

test('путь за пределы воркспейса отображается в свой код', async () => {
  const reader = readerWith('', async () => 'секрет')
  const result = await dispatch(reader, 'document', { path: '/etc/passwd' }, NO_SIGNAL)
  assert.equal(result.ok, false)
  assert.equal((result as { error: { code: string } }).error.code, 'document-outside-workspace')
})

test('неожиданное исключение не улетает наружу, а становится internal', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => { throw new Error('внезапно') },
  })
  const result = await dispatch(reader, 'list', {}, NO_SIGNAL)
  assert.equal(result.ok, false)
  const error = (result as { error: { code: string; message: string } }).error
  assert.equal(error.code, 'internal')
  assert.match(error.message, /внезапно/)
})

// Само-ревью главного свойства («наружу всегда уходит значение»): брошено не Error, а объект,
// у которого сама попытка получить текст (`toString`) тоже бросает. Без защиты внутри `failure`
// это разваливало бы dispatch — `String(error)` бросал бы уже из `catch`, без страховки.
test('исключение без работающего toString тоже не улетает наружу, а становится internal', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => {
      throw { toString() { throw new Error('вложенная ошибка') } }
    },
  })
  const result = await dispatch(reader, 'list', {}, NO_SIGNAL)
  assert.equal(result.ok, false)
  const error = (result as { error: { code: string; message: string } }).error
  assert.equal(error.code, 'internal')
  assert.equal(typeof error.message, 'string')
})

test('findDocument требует идентификатор', async () => {
  const result = await dispatch(readerWith(VIEW), 'findDocument', {}, NO_SIGNAL)
  assert.equal(result.ok, false)
  assert.equal(result.ok === false && result.error.code, 'bad-request')
})

test('findDocument отдаёт найденный артефакт клиенту', async () => {
  const VIEW_WITH_REFS = VIEW.replace(
    'Type: bft',
    'Type: bft\nReferences: ishmanov-cortex/bft/documentation/vibe/letter.md',
  )
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({ stdout: VIEW_WITH_REFS, stderr: '', code: 0, timedOut: false, killedBySignal: null }),
    listDirectory: async () => ['letter.md'],
    readTextFile: async () => '# Письмо',
  })
  const result = await dispatch(reader, 'findDocument', { id: 'PO-20' }, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.deepEqual(result.ok === true && result.value, {
    path: 'bft/documentation/vibe/letter.md',
    kind: 'markdown',
    content: '# Письмо',
  })
})

test('findDocument отдаёт null, когда показывать нечего', async () => {
  const result = await dispatch(readerWith(VIEW), 'findDocument', { id: 'PO-20' }, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.equal(result.ok === true && result.value, null)
})

test('sessionWorkspace отдаёт абсолютный путь рабочего пространства чатов', async () => {
  const result = await dispatch(readerWith(''), 'sessionWorkspace', {}, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.equal((result as { value: string | null }).value, '/w/bft')
})

test('sessionWorkspace отдаёт null, когда привязка выключена', async () => {
  const reader = new BacklogReader({ ...CONFIG, sessionPath: '' }, {
    runCommand: async () => ({ stdout: '', stderr: '', code: 0, timedOut: false, killedBySignal: null }),
  })
  const result = await dispatch(reader, 'sessionWorkspace', {}, NO_SIGNAL)
  assert.equal(result.ok, true)
  assert.equal((result as { value: string | null }).value, null)
})

test('sessionWorkspace за пределами воркспейса отвечает ошибкой, а не путём наружу', async () => {
  const reader = new BacklogReader({ ...CONFIG, sessionPath: '../../etc' }, {
    runCommand: async () => ({ stdout: '', stderr: '', code: 0, timedOut: false, killedBySignal: null }),
  })
  const result = await dispatch(reader, 'sessionWorkspace', {}, NO_SIGNAL)
  assert.equal(result.ok, false)
  assert.equal((result as { error: { code: string } }).error.code, 'document-outside-workspace')
})
