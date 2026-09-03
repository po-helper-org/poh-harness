import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BacklogReader } from '../src/reader.js'
import { loadConfig } from '../src/config.js'
import { runCommandWithNode } from '../src/ports.js'

/** Живой прогон возможен только там, где есть и воркспейс, и CLI. */
async function ready(): Promise<boolean> {
  if (!process.env.BFT_WORKSPACE_ROOT) return false
  const probe = await runCommandWithNode(process.env.BFT_BACKLOG_BIN ?? 'backlog', ['--version'], process.cwd())
  return probe.code === 0
}

test('живой воркспейс: список требований разбирается', async t => {
  if (!await ready()) {
    t.skip('нет BFT_WORKSPACE_ROOT или backlog не установлен')
    return
  }
  const reader = new BacklogReader(loadConfig(process.env))
  const tasks = await reader.listTasks()

  assert.ok(tasks.length > 0, 'в воркспейсе должна быть хотя бы одна задача БФТ')
  for (const task of tasks) {
    assert.match(task.id, /^[A-Z]+-[\d.]+$/)
    assert.ok(task.title.length > 0, `у задачи ${task.id} пустое название`)
    assert.ok(!task.title.startsWith('БФТ:'), `служебный префикс не снят у ${task.id}`)
  }
})

test('живой воркспейс: карточка первой задачи разбирается', async t => {
  if (!await ready()) {
    t.skip('нет BFT_WORKSPACE_ROOT или backlog не установлен')
    return
  }
  const reader = new BacklogReader(loadConfig(process.env))
  const [first] = await reader.listTasks()
  const task = await reader.getTask(first.id)

  assert.equal(task.id, first.id)
  assert.equal(task.stage, first.stage)
  assert.ok(task.description.length > 0, 'описание не должно быть пустым')
})
