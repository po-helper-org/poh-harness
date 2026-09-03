import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTextFileWithNode, runCommandWithNode } from '../src/ports.js'

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
