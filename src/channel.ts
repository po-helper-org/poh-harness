import {
  BacklogFailedError,
  BacklogTimeoutError,
  BacklogUnavailableError,
  DocumentOutsideWorkspaceError,
  DocumentUnreadableError,
  InvalidTaskIdError,
  TaskNotFoundError,
} from './errors.js'
import type { BacklogReader } from './reader.js'

/** Имя канала. Одна регистрация, подкоманды разбираются внутри. */
export const BFT_CHANNEL = '/bft'

export type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details: object } }

/** Ошибки предметной области несут готовый текст для пользователя — он и едет наружу. */
const CODES: ReadonlyArray<[new (...args: never[]) => Error, string]> = [
  [BacklogUnavailableError, 'backlog-unavailable'],
  [BacklogTimeoutError, 'backlog-timeout'],
  [BacklogFailedError, 'backlog-failed'],
  [TaskNotFoundError, 'task-not-found'],
  [InvalidTaskIdError, 'invalid-task-id'],
  [DocumentUnreadableError, 'document-unreadable'],
  [DocumentOutsideWorkspaceError, 'document-outside-workspace'],
]

function ok<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

function fail(code: string, message: string): RpcResult<never> {
  return { ok: false, error: { code, message, details: {} } }
}

function failure(error: unknown): RpcResult<never> {
  // Само извлечение сообщения защищено отдельным try/catch: `error` — исключение из чужого кода
  // (порта, CLI-обвязки), и его форма не гарантирована. `String(error)` вызывает чужой `toString`,
  // а `.message` на самодельном подклассе `Error` может оказаться бросающим геттером — в обоих
  // случаях без этой защиты `failure` сама бросит, а вызывается она уже из `catch` в `dispatch`
  // без внешней страховки, то есть свойство «наружу всегда уходит значение» нарушится.
  try {
    const message = error instanceof Error ? error.message : String(error)
    for (const [type, code] of CODES) {
      if (error instanceof type) return fail(code, message)
    }
    return fail('internal', message)
  } catch {
    return fail('internal', 'не удалось разобрать исключение')
  }
}

function stringField(payload: unknown, field: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[field]
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Разбирает подкоманду канала.
 * Наружу всегда уходит значение: любое исключение оборачивается в ответ с кодом,
 * потому что через провод исключения не летят.
 */
export async function dispatch(
  reader: BacklogReader,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  try {
    switch (endpoint) {
      case 'list':
        return ok(await reader.listTasks(signal))

      case 'task': {
        const id = stringField(payload, 'id')
        if (!id) return fail('bad-request', 'не передан идентификатор требования')
        return ok(await reader.getTask(id, signal))
      }

      case 'document': {
        const path = stringField(payload, 'path')
        if (!path) return fail('bad-request', 'не передан путь к документу')
        return ok(await reader.readDocument(path, signal))
      }

      case 'lastSync':
        return ok(await reader.readLastSync(signal))

      default:
        return fail('bad-request', `неизвестная подкоманда «${endpoint}»`)
    }
  } catch (error) {
    return failure(error)
  }
}
