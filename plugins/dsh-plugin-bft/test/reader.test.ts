import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BacklogReader } from '../src/reader.js'
import {
  BacklogFailedError,
  BacklogTimeoutError,
  BacklogUnavailableError,
  DocumentUnreadableError,
  InvalidTaskIdError,
  TaskNotFoundError,
} from '../src/errors.js'
import type { CommandResult } from '../src/ports.js'
import type { BftConfig } from '../src/config.js'

const CONFIG: BftConfig = {
  workspaceRoot: '/w',
  backlogBin: 'backlog',
  docsPath: 'bft/documentation',
  indexPath: 'bft/index',
  sessionPath: 'bft',
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
  return { stdout, stderr: '', code: 0, timedOut: false, killedBySignal: null }
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
  // ВНИМАНИЕ: ожидание намеренно изменено по находке IMPORTANT-2 (см. host-fix-report.md).
  // `--` перед позиционным идентификатором защищает от разбора вида `backlog task view --help`,
  // где идентификатор выглядел бы как флаг; было ['task', 'view', 'PO-20', '--plain'].
  assert.deepEqual(seen, ['task', 'view', '--plain', '--', 'PO-20'])
})

test('отсутствие CLI даёт ошибку с подсказкой про установку', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({ stdout: '', stderr: 'spawn ENOENT', code: -1, timedOut: false, killedBySignal: null }),
  })
  await assert.rejects(() => reader.listTasks(), (e: Error) => {
    assert.ok(e instanceof BacklogUnavailableError)
    assert.match(e.message, /brew install backlog-md/)
    return true
  })
})

test('ненулевой код даёт ошибку с первой строкой stderr', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({
      stdout: '',
      stderr: 'Task PO-99 not found\nтрассировка',
      code: 1,
      timedOut: false,
      killedBySignal: null,
    }),
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
  const html = await reader.readDocument('bft/documentation/vk/vk.html')
  assert.equal(html, '<html>документ</html>')
  assert.deepEqual(seen, ['/w/bft/documentation/vk/vk.html'])
})

test('отсутствующий документ даёт null', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => null,
  })
  assert.equal(await reader.readDocument('bft/documentation/нет/нет.html'), null)
})

test('путь за пределы воркспейса отвергается до чтения', async () => {
  let touched = false
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => { touched = true; return 'секрет' },
  })
  await assert.rejects(
    () => reader.readDocument('bft/documentation/../../../../etc/passwd'),
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
  assert.deepEqual(seen, ['/w/bft/index/last-sync.json'])
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

// === IMPORTANT 2: порт бросает на пользовательском вводе ===
// Идентификатор задачи приходит от пользователя интерфейса, поэтому проверяется до похода в CLI:
// `backlog task view --help --plain` тоже отвечает кодом 0, а мусорный идентификатор без проверки
// дошёл бы до команды как есть.

test('некорректный идентификатор задачи (пробел на конце) отвергается до обращения к CLI', async () => {
  let called = false
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => {
      called = true
      return ok(VIEW)
    },
  })
  await assert.rejects(() => reader.getTask('PO-1 '), (e: Error) => {
    assert.ok(e instanceof InvalidTaskIdError)
    assert.match(e.message, /PO-1/)
    return true
  })
  assert.equal(called, false, 'CLI не должен вызываться для некорректного идентификатора')
})

test('идентификатор вида флага (--help) отвергается, а не уходит в CLI как позиционный аргумент', async () => {
  let called = false
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => {
      called = true
      return ok(VIEW)
    },
  })
  await assert.rejects(() => reader.getTask('--help'), InvalidTaskIdError)
  assert.equal(called, false)
})

// === IMPORTANT 6: «задача не найдена» выпадает из таксономии ===
// Живой `backlog task view PO-99999 --plain` отвечает кодом 0 и текстом «Task PO-99999 not found.» —
// без явной проверки это ушло бы в parseTaskView как мусор и дало бы сырой Error разбора.

test('отсутствующая задача даёт TaskNotFoundError, а не сырую ошибку разбора', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({
      stdout: '',
      stderr: 'Task PO-99999 not found.',
      code: 0,
      timedOut: false,
      killedBySignal: null,
    }),
  })
  await assert.rejects(() => reader.getTask('PO-99999'), (e: Error) => {
    assert.ok(e instanceof TaskNotFoundError)
    assert.match(e.message, /PO-99999/)
    return true
  })
})

// === CRITICAL 1 (замыкание на уровне reader): таймаут не должен маскироваться под успех ===

test('timedOut=true не принимается за чистый успех, даже если код 0', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ({
      stdout: LIST.slice(0, 10),
      stderr: '',
      code: 0,
      timedOut: true,
      killedBySignal: null,
    }),
  })
  await assert.rejects(() => reader.listTasks(), BacklogTimeoutError)
})

// === IMPORTANT 5: чтение файла глотает все ошибки подряд ===
// Не-ENOENT ошибка порта не должна тихо превращаться в null на уровне reader.

test('ошибка чтения документа не превращается в null', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async () => {
      throw new DocumentUnreadableError('/w/bft/documentation/x.html', 'EACCES')
    },
  })
  await assert.rejects(() => reader.readDocument('bft/documentation/x.html'), DocumentUnreadableError)
})

// === IMPORTANT 4: симлинк обходит защиту пути ===
// Лексическая проверка смотрит на путь как на текст и не замечает симлинк, ведущий наружу
// каталога документов. Настоящий воркспейс на диске нужен, потому что realpath разрешает
// только реальные симлинки — подделкой порта это не проверить.

test('симлинк внутри каталога документов, ведущий наружу воркспейса, отвергается', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'bft-reader-ws-'))
  const docsDir = join(workspaceRoot, 'bft', 'documentation')
  await mkdir(docsDir, { recursive: true })

  const secretDir = await mkdtemp(join(tmpdir(), 'bft-reader-secret-'))
  const secretFile = join(secretDir, 'id_rsa')
  await writeFile(secretFile, 'СЕКРЕТНЫЙ ПРИВАТНЫЙ КЛЮЧ', 'utf8')

  const linkPath = join(docsDir, 'evil.html')
  await symlink(secretFile, linkPath)

  const config: BftConfig = { ...CONFIG, workspaceRoot }
  // readTextFile намеренно НЕ подменяется: защита должна сработать на настоящем чтении,
  // до того как содержимое секрета попадёт в CommandResult или в возвращаемое значение.
  const reader = new BacklogReader(config, { runCommand: async () => ok('') })

  await assert.rejects(
    () => reader.readDocument('bft/documentation/evil.html'),
    (e: Error) => {
      assert.ok(e instanceof DocumentOutsideWorkspaceError)
      return true
    },
  )
})

// === MINOR: inside.startsWith('..') ложно отвергает легальный путь вида ..hidden/x.html ===

test('документ с именем, начинающимся на две точки, но лежащим внутри каталога документов, читается', async () => {
  const seen: string[] = []
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(''),
    readTextFile: async path => {
      seen.push(path)
      return '<html>легальный документ</html>'
    },
  })
  const html = await reader.readDocument('bft/documentation/..hidden/x.html')
  assert.equal(html, '<html>легальный документ</html>')
  assert.deepEqual(seen, ['/w/bft/documentation/..hidden/x.html'])
})

// === MINOR: config.taskType документирован, но не работает ===

test('listTasks использует тип задач из конфигурации, а не жёстко «bft»', async () => {
  const stdout = 'To Do:\n  [HIGH] [chore] PO-5 - Хозяйственная задача\n  [HIGH] [bft] PO-20 - БФТ: Название\n'
  const reader = new BacklogReader(
    { ...CONFIG, taskType: 'chore' },
    { runCommand: async () => ok(stdout) },
  )
  const tasks = await reader.listTasks()
  assert.deepEqual(tasks.map(t => t.id), ['PO-5'])
})

// --- Поиск документа по конвенции (регрессия: FAST-DONE показывал пустой экран) ---

/** Вывод `task view` с произвольным набором ссылок. */
function viewWithRefs(refs: string): string {
  return `Task PO-22 - БФТ: Билеты в кино в Vibe App
==========

Status: ○ FAST-DONE
Priority: High
Type: bft
References: ${refs}

Description:
--------------------------------------------------
Заказчик: Геворгян Виктория (Коммерция). Данные не пробрасываются.
`
}

test('находит html, даже если в ссылках только .md с префиксом репозитория — регрессия PO-22', async () => {
  // Ровно то, что лежит в задаче PO-22: .html на диске есть, но в References его нет,
  // а все пути записаны с префиксом имени репозитория.
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs(
      'ishmanov-cortex/bft/documentation/vibe-kino-user-data/letter.md, '
      + 'ishmanov-cortex/bft/documentation/vibe-kino-user-data/vibe-kino-user-data.md',
    )),
    listDirectory: async () => ['letter.md', 'requirements.md', 'vibe-kino-user-data.md', 'vibe-kino-user-data.html'],
    readTextFile: async () => '<!doctype html><h1>БФТ</h1>',
  })
  const doc = await reader.findDocument('PO-22')
  assert.equal(doc?.kind, 'html')
  assert.equal(doc?.path, 'bft/documentation/vibe-kino-user-data/vibe-kino-user-data.html')
})

test('FAST-DONE без html показывает письмо, а не пустой экран', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs('bft/documentation/vibe/letter.md')),
    listDirectory: async () => ['letter.md', 'requirements.md'],
    readTextFile: async () => '# Письмо\n\nЦель: ...',
  })
  const doc = await reader.findDocument('PO-22')
  assert.equal(doc?.kind, 'markdown')
  assert.equal(doc?.path, 'bft/documentation/vibe/letter.md')
})

test('старое имя каталога .bft в ссылках всё ещё находит документ', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs('ishmanov-cortex/.bft/documentation/vibe/vibe.md')),
    listDirectory: async () => ['vibe.html'],
    readTextFile: async () => '<html></html>',
  })
  const doc = await reader.findDocument('PO-22')
  assert.equal(doc?.path, 'bft/documentation/vibe/vibe.html')
})

test('нет ссылок в каталог документов — документа нет, но и падения нет', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs('https://jira.mts.ru/browse/GDSLV-1')),
    listDirectory: async () => ['vibe.html'],
    readTextFile: async () => '<html></html>',
  })
  assert.equal(await reader.findDocument('PO-22'), null)
})

test('пустая папка эпика — документа нет', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs('bft/documentation/vibe/letter.md')),
    listDirectory: async () => [],
    readTextFile: async () => null,
  })
  assert.equal(await reader.findDocument('PO-22'), null)
})

test('пустой файл не выдаётся за документ — берётся следующий кандидат', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs('bft/documentation/vibe/letter.md')),
    listDirectory: async () => ['vibe.html', 'letter.md'],
    readTextFile: async (path: string) => (path.endsWith('.html') ? '   ' : '# Письмо'),
  })
  const doc = await reader.findDocument('PO-22')
  assert.equal(doc?.path, 'bft/documentation/vibe/letter.md')
})

test('нечитаемый html не обрывает поиск — показывается markdown', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs('bft/documentation/vibe/letter.md')),
    listDirectory: async () => ['vibe.html', 'letter.md'],
    readTextFile: async (path: string) => {
      if (path.endsWith('.html')) throw new DocumentUnreadableError(path, 'permission denied')
      return '# Письмо'
    },
  })
  const doc = await reader.findDocument('PO-22')
  assert.equal(doc?.kind, 'markdown')
})

test('ссылка на артефакт вглубь папки тоже определяет эпик', async () => {
  const reader = new BacklogReader(CONFIG, {
    runCommand: async () => ok(viewWithRefs('ishmanov-cortex/bft/documentation/vibe/artefacts/validation.md')),
    listDirectory: async () => ['vibe.html'],
    readTextFile: async () => '<html></html>',
  })
  const doc = await reader.findDocument('PO-22')
  assert.equal(doc?.path, 'bft/documentation/vibe/vibe.html')
})

test('рабочее пространство чатов резолвится в абсолютный путь', () => {
  const reader = new BacklogReader(CONFIG, {})
  assert.equal(reader.resolveSessionPath(), '/w/bft')
})

test('пустой sessionPath означает «не привязывать» — null, а не путь на корень', () => {
  const reader = new BacklogReader({ ...CONFIG, sessionPath: '' }, {})
  assert.equal(reader.resolveSessionPath(), null)
})

test('вложенный sessionPath резолвится относительно корня воркспейса', () => {
  const reader = new BacklogReader({ ...CONFIG, sessionPath: 'bft/chats' }, {})
  assert.equal(reader.resolveSessionPath(), '/w/bft/chats')
})

test('sessionPath за пределами воркспейса отвергается, а не привязывает чаты к чужой папке', () => {
  const reader = new BacklogReader({ ...CONFIG, sessionPath: '../../etc' }, {})
  assert.throws(() => reader.resolveSessionPath(), DocumentOutsideWorkspaceError)
})

test('абсолютный sessionPath вне воркспейса тоже отвергается', () => {
  const reader = new BacklogReader({ ...CONFIG, sessionPath: '/etc' }, {})
  assert.throws(() => reader.resolveSessionPath(), DocumentOutsideWorkspaceError)
})
