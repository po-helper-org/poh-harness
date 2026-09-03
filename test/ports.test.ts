import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { constants as osConstants, tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTextFileWithNode, runCommandWithNode, runCommandWithTimeout } from '../src/ports.js'
import { DocumentUnreadableError } from '../src/errors.js'

test('запуск команды возвращает вывод и код', async () => {
  const r = await runCommandWithNode('node', ['-e', 'console.log("привет")'], process.cwd())
  assert.equal(r.code, 0)
  assert.equal(r.stdout.trim(), 'привет')
})

test('ненулевой код возвращается, а не бросается', async () => {
  const r = await runCommandWithNode('node', ['-e', 'process.exit(3)'], process.cwd())
  assert.equal(r.code, 3)
})

test('поток ошибок отдаётся отдельно', async () => {
  const r = await runCommandWithNode('node', ['-e', 'console.error("беда")'], process.cwd())
  assert.match(r.stderr, /беда/)
})

test('несуществующая команда даёт код -1 и текст ошибки', async () => {
  const r = await runCommandWithNode('заведомо-нет-такой-команды', [], process.cwd())
  assert.equal(r.code, -1)
  assert.ok(r.stderr.length > 0, 'причина должна попасть в stderr')
})

test('чтение файла возвращает содержимое', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bft-ports-'))
  const file = join(dir, 'x.txt')
  await writeFile(file, 'содержимое', 'utf8')
  assert.equal(await readTextFileWithNode(file), 'содержимое')
})

test('отсутствующий файл даёт null, а не исключение', async () => {
  assert.equal(await readTextFileWithNode(join(tmpdir(), 'нет-такого-файла-bft')), null)
})

// === CRITICAL 1: таймаут не гарантирует ни завершения, ни различимого исхода ===
// Боевой COMMAND_TIMEOUT_MS — 10 секунд, ждать его в каждом тесте дорого, поэтому три
// сценария ниже проверяются через runCommandWithTimeout с укороченным таймаутом. Это тот же
// код, что и у runCommandWithNode, — отличается только длительность ожидания.

test('обычное завершение отдаёт timedOut=false и killedBySignal=null', async () => {
  const r = await runCommandWithNode('node', ['-e', 'process.exit(0)'], process.cwd())
  assert.equal(r.timedOut, false)
  assert.equal(r.killedBySignal, null)
})

test('процесс, глушащий SIGTERM, всё равно останавливается через SIGKILL и промис разрешается', async () => {
  const script = "process.on('SIGTERM', () => {}); setInterval(() => {}, 100000);"
  const r = await runCommandWithTimeout('node', ['-e', script], process.cwd(), 100)
  assert.equal(r.timedOut, true)
  assert.equal(r.killedBySignal, 'SIGKILL')
  assert.notEqual(r.code, -1, 'заглушенный SIGTERM — не про отсутствие CLI')
})

test('SIGTERM проигнорирован, процесс выходит кодом 0 позже таймаута — timedOut не даёт принять это за чистый успех', async () => {
  const script = "process.on('SIGTERM', () => {}); process.stdout.write('часть'); setTimeout(() => process.exit(0), 300);"
  const r = await runCommandWithTimeout('node', ['-e', script], process.cwd(), 100)
  assert.equal(r.code, 0)
  assert.equal(r.stdout, 'часть')
  assert.equal(r.timedOut, true, 'код 0 не означает, что уложились в таймаут')
  assert.equal(r.killedBySignal, null, 'процесс завершился сам, а не от нашего сигнала')
})

test('обычный (не глушащий сигналы) процесс после таймаута не получает код -1', async () => {
  const r = await runCommandWithTimeout('node', ['-e', 'setTimeout(() => {}, 100000);'], process.cwd(), 100)
  assert.notEqual(r.code, -1, 'обычный таймаут — не «нет CLI»')
  assert.equal(r.timedOut, true)
  assert.equal(r.killedBySignal, 'SIGTERM')
  assert.equal(r.code, 128 + osConstants.signals.SIGTERM)
})

test('отмена через AbortSignal идёт тем же путём SIGTERM → SIGKILL', async () => {
  const controller = new AbortController()
  const script = "process.on('SIGTERM', () => {}); setInterval(() => {}, 100000);"
  const promise = runCommandWithNode('node', ['-e', script], process.cwd(), controller.signal)
  // Дать ребёнку время запуститься и поставить обработчик SIGTERM: отмена «в тот же тик»
  // застала бы его до регистрации обработчика, и он погиб бы от сигнала по умолчанию —
  // тест проверял бы не то (эскалацию), а гонку запуска.
  await new Promise(resolveDelay => setTimeout(resolveDelay, 150))
  controller.abort()
  const r = await promise
  assert.equal(r.killedBySignal, 'SIGKILL')
  assert.equal(r.timedOut, false, 'это отмена, а не таймаут')
})

test('несуществующий рабочий каталог не выдаётся за отсутствие CLI', async () => {
  const r = await runCommandWithNode('node', ['--version'], '/нет-такого-каталога-у-bft/совсем')
  assert.notEqual(r.code, -1, 'битый cwd — не про отсутствие CLI')
  assert.notEqual(r.code, 0)
  assert.ok(r.stderr.length > 0)
})

test('переполнение вывода останавливает процесс, а не выдаётся за отсутствие CLI', async () => {
  const r = await runCommandWithNode(
    'node',
    ['-e', "process.stdout.write('x'.repeat(9 * 1024 * 1024))"],
    process.cwd(),
  )
  assert.notEqual(r.code, -1, 'переполнение буфера — не про отсутствие CLI')
  assert.ok(r.stdout.length > 0)
})

// === IMPORTANT 2: порт бросает на пользовательском вводе ===
// Порт — контракт «никогда не бросает»: любое синхронное исключение из запуска процесса
// превращается в CommandResult с кодом -1, а не в отклонённый промис.

test('порт не бросает на аргументе с null-байтом', async () => {
  const r = await runCommandWithNode('node', ['-e', 'x', 'PO-1' + String.fromCharCode(0)], process.cwd())
  assert.equal(r.code, -1)
  assert.ok(r.stderr.length > 0, 'причина должна попасть в stderr')
})

test('порт не бросает на пустом пути к программе', async () => {
  const r = await runCommandWithNode('', [], process.cwd())
  assert.equal(r.code, -1)
  assert.ok(r.stderr.length > 0)
})

// === IMPORTANT 3: окружение спавна не чистится ===

test('переменная с секретом в имени не доходит до ребёнка, обычная — доходит', async () => {
  const prevToken = process.env.BFT_TEST_SECRET_TOKEN
  const prevNormal = process.env.BFT_TEST_NORMAL_VAR
  process.env.BFT_TEST_SECRET_TOKEN = 'сверхсекретно'
  process.env.BFT_TEST_NORMAL_VAR = 'обычное'
  try {
    const r = await runCommandWithNode(
      'node',
      [
        '-e',
        'console.log(JSON.stringify({secret: process.env.BFT_TEST_SECRET_TOKEN ?? null, normal: process.env.BFT_TEST_NORMAL_VAR ?? null}))',
      ],
      process.cwd(),
    )
    const parsed = JSON.parse(r.stdout) as { secret: string | null; normal: string | null }
    assert.equal(parsed.secret, null, 'секрет не должен попасть в окружение ребёнка')
    assert.equal(parsed.normal, 'обычное', 'обычная переменная должна дойти как есть')
  } finally {
    if (prevToken === undefined) delete process.env.BFT_TEST_SECRET_TOKEN
    else process.env.BFT_TEST_SECRET_TOKEN = prevToken
    if (prevNormal === undefined) delete process.env.BFT_TEST_NORMAL_VAR
    else process.env.BFT_TEST_NORMAL_VAR = prevNormal
  }
})

// === IMPORTANT 5: чтение файла глотает все ошибки подряд ===

test('каталог вместо файла даёт DocumentUnreadableError, а не null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bft-ports-dir-'))
  await mkdir(join(dir, 'вложенный'))
  await assert.rejects(() => readTextFileWithNode(dir), (e: Error) => {
    assert.ok(e instanceof DocumentUnreadableError)
    assert.match(e.message, /EISDIR|illegal operation/i)
    return true
  })
})
