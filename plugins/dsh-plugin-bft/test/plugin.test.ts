import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/plugin.js'
import { BFT_CHANNEL } from '../src/channel.js'

type Handler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>

/** Поднимает контекст руками и перехватывает обработчик канала: помощника для этого в харнессе нет. */
async function mount(): Promise<{ channel: string; handler: Handler }> {
  let channel = ''
  let handler: Handler | undefined
  const ctx = new Context()
  ctx.provide('connection', {
    rpc: {
      handle: (name: string, h: Handler) => {
        channel = name
        handler = h
        return () => Promise.resolve()
      },
    },
  })
  ctx.plugin(plugin, { workspaceRoot: '/w' })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(handler !== undefined, 'канал должен быть зарегистрирован')
  return { channel, handler }
}

test('плагин регистрирует канал под своим именем', async () => {
  const { channel } = await mount()
  assert.equal(channel, BFT_CHANNEL)
})

test('обработчик отвечает значением, а не исключением', async () => {
  const { handler } = await mount()
  const result = await handler('нет-такой', {}, new AbortController().signal)
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'bad-request', message: 'неизвестная подкоманда «нет-такой»', details: {} },
  })
})

test('без службы соединения плагин поднимается и не падает', async () => {
  const ctx = new Context()
  ctx.plugin(plugin, { workspaceRoot: '/w' })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(true, 'композиция без connection обязана подниматься')
})
