import type { Context } from '@deepseek-ai/cordis'
import { BFT_CHANNEL, dispatch, type RpcResult } from './channel.js'
import { Config, toBftConfig, type PluginConfig } from './plugin-config.js'
import { BacklogReader } from './reader.js'

export const name = 'dsh-plugin-bft'
export { Config }

/** Форма службы соединения, которой нам достаточно. */
interface ConnectionLike {
  rpc: {
    handle: (
      channel: string,
      handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>,
      options?: { authority?: string },
    ) => () => Promise<void> | void
  }
}

/**
 * Поднимает раздел требований.
 * Служба соединения необязательна и берётся отложенной инъекцией: без неё композиция
 * без веб-интерфейса всё равно должна подниматься.
 */
export function apply(ctx: Context, config: PluginConfig): void {
  const reader = new BacklogReader(toBftConfig(config, process.env))

  ctx.inject(['connection'], (scoped: Context) => {
    const connection = scoped.get('connection') as unknown as ConnectionLike
    scoped.effect(
      () => connection.rpc.handle(
        BFT_CHANNEL,
        (endpoint, payload, signal) => dispatch(reader, endpoint, payload, signal),
        { authority: 'loopback' },
      ),
      'dsh-plugin-bft: канал /bft',
    )
  })
}
