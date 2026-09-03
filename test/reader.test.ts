import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BacklogReader } from '../src/reader.js'
import { BacklogFailedError, BacklogUnavailableError } from '../src/errors.js'
import type { CommandResult } from '../src/ports.js'
import type { BftConfig } from '../src/config.js'

const CONFIG: BftConfig = {
  workspaceRoot: '/w',
  backlogBin: 'backlog',
  docsPath: '.bft/documentation',
  indexPath: '.bft/index',
  taskType: 'bft',
  teamName: 'GDS/Платформа',
  jira: { baseUrl: 'https://jira.mts.ru' },
  confluence: { baseUrl: 'https://confluence.mts.ru' },
}

const LIST = `To Do:
  [HIGH] [bft] PO-20 - БФТ: Блокировка мест на схеме зала
  [MEDIUM] PO-1 - Обычная задача

DEEP-DONE:
  [HIGH] [bft] PO-12 - БФТ: Исключить Email
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

function ok(stdout: string): CommandResult {
  return { stdout, stderr: '', code: 0 }
}

test('список задач разбирается и фильтруется по типу', async () => {
  const reader = new BacklogReader(CONFIG, { runCommand: async () => ok(LIST) })
  const tasks = await reader.listTasks()
  assert.deepEqual(tasks.map(t => t.id), ['PO-20', 'PO-12'])
})

test('команда запускается в корне воркспейса с нужными аргументами', async () => {
  const calls: Array<{ bin: string; args: string[]; cwd: string }> = []
  const reader = new BacklogReader(CONFIG, {
    runCommand: async (bin, args, cwd) => {
      calls.push({ bin, args, cwd })
      return ok(LIST)
    },
  })
  await reader.listTasks()
  assert.deepEqual(calls, [{ bin: 'backlog', args: ['task', 'list', '--plain'], cwd: '/w' }])
})

test('карточка задачи разбирается', async () => {
  const reader = new BacklogReader(CONFIG, { runCommand: async () => ok(VIEW) })
  const task = await reader.getTask('PO-20')
  assert.equal(task.id, 'PO-20')
  assert.equal(task.customer, 'Кардона Елена (ОПРО)')
})

test('идентификатор задачи попадает в аргументы как есть', async () => {
  let seen: string[] = []
  const reader = new BacklogReader(CONFIG, {
    runCommand: async (_bin, args) => {
      seen = args
      return ok(VIEW)
    },
  })
  await reader.getTask('PO-20')
  assert.deepEqual(seen, ['task', 'view', 'PO-20', '--plain'])
})

test('отсутствие CLI даёт ошибку с подсказкой про установку', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({ stdout: '', stderr: 'spawn ENOENT', code: -1 }),
  })
  await assert.rejects(() => reader.listTasks(), (e: Error) => {
    assert.ok(e instanceof BacklogUnavailableError)
    assert.match(e.message, /brew install backlog-md/)
    return true
  })
})

test('ненулевой код даёт ошибку с первой строкой stderr', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({ stdout: '', stderr: 'Task PO-99 not found\nтрассировка', code: 1 }),
  })
  await assert.rejects(() => reader.getTask('PO-99'), (e: Error) => {
    assert.ok(e instanceof BacklogFailedError)
    assert.match(e.message, /Task PO-99 not found/)
    assert.ok(!e.message.includes('трассировка'), 'в сообщение идёт только первая строка')
    return true
  })
})

test('путь к CLI берётся из конфигурации', async () => {
  let bin = ''
  const reader = new BacklogReader(
    { ...CONFIG, backlogBin: '/opt/homebrew/bin/backlog' },
    { runCommand: async b => { bin = b; return ok(LIST) } },
  )
  await reader.listTasks()
  assert.equal(bin, '/opt/homebrew/bin/backlog')
})

import { DocumentOutsideWorkspaceError } from '../src/errors.js'

test('документ читается по пути относительно воркспейса', async () => {
  const seen: string[] = []
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async path => { seen.push(path); return '<html>документ</html>' },
  })
  const html = await reader.readDocument('.bft/documentation/vk/vk.html')
  assert.equal(html, '<html>документ</html>')
  assert.deepEqual(seen, ['/w/.bft/documentation/vk/vk.html'])
})

test('отсутствующий документ даёт null', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => null,
  })
  assert.equal(await reader.readDocument('.bft/documentation/нет/нет.html'), null)
})

test('путь за пределы воркспейса отвергается до чтения', async () => {
  let touched = false
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => { touched = true; return 'секрет' },
  })
  await assert.rejects(
    () => reader.readDocument('.bft/documentation/../../../../etc/passwd'),
    (e: Error) => {
      assert.ok(e instanceof DocumentOutsideWorkspaceError)
      return true
    },
  )
  assert.equal(touched, false, 'файл не должен быть прочитан')
})

test('абсолютный путь тоже отвергается', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => 'секрет',
  })
  await assert.rejects(() => reader.readDocument('/etc/passwd'), DocumentOutsideWorkspaceError)
})

test('документ вне каталога документов отвергается', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => 'чужое',
  })
  await assert.rejects(() => reader.readDocument('backlog/config.yml'), DocumentOutsideWorkspaceError)
})

test('метка синхронизации читается из каталога индекса', async () => {
  const seen: string[] = []
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async path => {
      seen.push(path)
      return JSON.stringify({ at: '2026-09-03T10:00:00Z', checkedRows: 41 })
    },
  })
  const sync = await reader.readLastSync()
  assert.equal(sync?.at, '2026-09-03T10:00:00Z')
  assert.equal(sync?.checkedRows, 41)
  assert.deepEqual(seen, ['/w/.bft/index/last-sync.json'])
})

test('нет метки — null, панель всё равно рисуется', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => null,
  })
  assert.equal(await reader.readLastSync(), null)
})

test('битая метка — null, а не исключение', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => '{не json',
  })
  assert.equal(await reader.readLastSync(), null)
})
