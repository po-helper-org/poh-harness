import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'

export interface CommandResult {
  stdout: string
  stderr: string
  /** Код возврата процесса. `-1` — процесс не удалось запустить вовсе. */
  code: number
}

/** Порт запуска внешней команды. В тестах подменяется подделкой. */
export type RunCommand = (bin: string, args: string[], cwd: string) => Promise<CommandResult>

/** Порт чтения текстового файла. `null` — файла нет; это не ошибка. */
export type ReadTextFile = (path: string) => Promise<string | null>

/** Больше десяти секунд `backlog` не думает даже на большом проекте. */
const COMMAND_TIMEOUT_MS = 10_000
/** Вывод по списку задач измеряется десятками килобайт; запас на порядок. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/**
 * Запускает команду и всегда возвращает результат, а не бросает.
 * Решение о том, ошибка это или нет, принимает вызывающий: несуществующий CLI и
 * непустой код возврата — разные ситуации с разными сообщениями для пользователя.
 */
export function runCommandWithNode(bin: string, args: string[], cwd: string): Promise<CommandResult> {
  return new Promise(resolve => {
    execFile(
      bin,
      args,
      { cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          // Процесс не стартовал: нет такого файла, нет прав, вышло время.
          resolve({ stdout: stdout ?? '', stderr: stderr || error.message, code: -1 })
          return
        }
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: (error?.code as number) ?? 0 })
      },
    )
  })
}

/** Читает файл в UTF-8. Отсутствие файла — обычное состояние, поэтому `null`, а не исключение. */
export async function readTextFileWithNode(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}
