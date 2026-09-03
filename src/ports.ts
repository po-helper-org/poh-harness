import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { constants as osConstants } from 'node:os'
import { DocumentUnreadableError } from './errors.js'

export interface CommandResult {
  stdout: string
  stderr: string
  /**
   * Код возврата процесса.
   * `-1` — программу в принципе не удалось запустить: нет такого бинаря, нет прав его выполнить,
   * либо аргументы были настолько битыми, что `spawn` бросил синхронно (порт это гасит сам).
   * `-2` — запустить не удалось по другой причине, не связанной с отсутствием CLI (например,
   * не существует рабочий каталог) — такую причину нельзя путать с «нет CLI».
   */
  code: number
  /**
   * `true`, если исполнение остановлено локальным таймаутом порта (`COMMAND_TIMEOUT_MS`).
   * Это восстановить постфактум нельзя: ребёнок мог заглушить SIGTERM и позже выйти сам с
   * кодом 0 — тогда `code` выглядит как чистый успех, а `timedOut` — единственный признак,
   * что вывод собирался под давлением остановки и доверять ему как полному нельзя.
   */
  timedOut: boolean
  /**
   * Сигнал, которым порт в итоге остановил процесс (по таймауту, по переполнению вывода или по
   * отмене через `signal`). `null` — процесс закрылся сам, порту не пришлось его останавливать.
   */
  killedBySignal: string | null
}

/**
 * Порт запуска внешней команды. В тестах подменяется подделкой.
 * `signal` пробрасывает отмену вызывающей стороны (например, канала `connection.rpc`) до самого
 * процесса — тем же путём SIGTERM → SIGKILL, что и локальный таймаут порта.
 */
export type RunCommand = (bin: string, args: string[], cwd: string, signal?: AbortSignal) => Promise<CommandResult>

/** Порт чтения текстового файла. `null` — файла нет; это не ошибка. Любая другая причина неудачи — исключение. */
export type ReadTextFile = (path: string) => Promise<string | null>

/** Больше десяти секунд `backlog` не думает даже на большом проекте. */
const COMMAND_TIMEOUT_MS = 10_000
/** Столько ждём после SIGTERM, прежде чем добить SIGKILL — процессу, который сам не заглушает
 *  сигнал, этого хватает на штатное завершение. */
const KILL_GRACE_MS = 2_000
/** Вывод по списку задач измеряется десятками килобайт; запас на порядок. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/** Переменные с такими именами не идут в окружение ребёнка — тот же признак, что и в харнессе
 *  (`packages/subprocess/subprocess/src/index.ts`). */
const SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i

/** Копия окружения хоста без переменных вида `*TOKEN*`/`*KEY*`/`*PASSWORD*`/`*SECRET*`. */
function scrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, val] of Object.entries(process.env)) {
    if (val !== undefined && !SENSITIVE_ENV_PATTERN.test(key)) env[key] = val
  }
  return env
}

/** Код возврата в стиле POSIX-оболочек для процесса, убитого сигналом: `128 + номер_сигнала`. */
function signalExitCode(signal: NodeJS.Signals): number {
  const num = (osConstants.signals as Record<string, number | undefined>)[signal] ?? 0
  return 128 + num
}

/**
 * То же самое, что `runCommandWithNode`, но с настраиваемым таймаутом.
 * Нужен только тестам: ждать боевые `COMMAND_TIMEOUT_MS` в каждом сценарии дорого,
 * а делать таймаут настраиваемым через окружение — лишний паблик-контракт без нужды.
 */
export function runCommandWithTimeout(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  return new Promise(resolve => {
    let child: ChildProcess
    try {
      child = spawn(bin, args, { cwd, env: scrubbedEnv(), windowsHide: true })
    } catch (err) {
      // Битые аргументы (например, null-байт) или пустой путь к программе — spawn бросает
      // синхронно. Порт не бросает никогда: это его контракт, поэтому гасим здесь.
      resolve({
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        code: -1,
        timedOut: false,
        killedBySignal: null,
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let outputBytes = 0
    let outputExceeded = false
    let timedOut = false
    let settled = false
    let killTimer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: CommandResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (killTimer) clearTimeout(killTimer)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve(result)
    }

    // Останавливаем сами: SIGTERM, и если процесс через льготный срок ещё жив — SIGKILL.
    // Промис при этом не разрешается здесь — только когда процесс реально закроется
    // ('error' на не стартовавшем или 'close' на стартовавшем), поэтому эскалация
    // гарантирует, что он когда-нибудь закроется, а не «когда-нибудь разрешится сама».
    // `killedBySignal` в итоговый результат не пишем отсюда: попытка убить — это не то же самое,
    // что «процесс действительно погиб от сигнала» (он мог заглушить SIGTERM и выйти сам с
    // кодом 0) — источник истины один, событие 'close' и его параметр `signal`.
    const escalate = (first: NodeJS.Signals) => {
      if (settled) return
      child.kill(first)
      if (killTimer) clearTimeout(killTimer)
      killTimer = setTimeout(() => {
        if (settled) return
        child.kill('SIGKILL')
      }, KILL_GRACE_MS)
    }

    const onAbort = () => escalate('SIGTERM')

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      escalate('SIGTERM')
    }, timeoutMs)

    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')

    const trackOutput = (chunk: string, into: 'stdout' | 'stderr') => {
      if (into === 'stdout') stdout += chunk
      else stderr += chunk
      outputBytes += Buffer.byteLength(chunk, 'utf8')
      // Переполнение — не про отсутствие CLI: процесс стартовал и работает, поэтому его
      // останавливают тем же путём, что и таймаут, а не отдают за -1.
      if (!outputExceeded && outputBytes > MAX_OUTPUT_BYTES) {
        outputExceeded = true
        escalate('SIGTERM')
      }
    }
    child.stdout?.on('data', (chunk: string) => trackOutput(chunk, 'stdout'))
    child.stderr?.on('data', (chunk: string) => trackOutput(chunk, 'stderr'))

    child.once('error', (err: NodeJS.ErrnoException) => {
      // Node отдаёт ENOENT с одинаковой формой и на отсутствующий бинарь, и на отсутствующий
      // рабочий каталог — по самому событию их не отличить. Проверяем cwd явно, чтобы битый
      // рабочий каталог не притворился отсутствующим CLI.
      const cwdMissing = !existsSync(cwd)
      finish({
        stdout: '',
        stderr: stderr || (cwdMissing ? `рабочий каталог не существует: ${cwd}` : err.message),
        code: cwdMissing ? -2 : -1,
        timedOut,
        killedBySignal: null,
      })
    })

    child.once('close', (code, sig) => {
      if (sig) {
        finish({ stdout, stderr, code: signalExitCode(sig), timedOut, killedBySignal: sig })
      } else {
        finish({ stdout, stderr, code: code ?? -1, timedOut, killedBySignal: null })
      }
    })
  })
}

/**
 * Запускает команду с ручным контролем жизненного цикла и всегда возвращает результат, а не
 * бросает. Решение о том, ошибка это или нет, принимает вызывающий: несуществующий CLI и
 * непустой код возврата — разные ситуации с разными сообщениями для пользователя.
 *
 * `execFile` для этого не годится: его встроенный `timeout` посылает сигнал один раз и не
 * эскалирует — ребёнок, заглушивший SIGTERM, живёт дольше таймаута, и промис не разрешается
 * вообще. Здесь процесс останавливают сами: SIGTERM, а если через `KILL_GRACE_MS` он ещё жив —
 * SIGKILL, который заглушить нельзя.
 */
export function runCommandWithNode(
  bin: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<CommandResult> {
  return runCommandWithTimeout(bin, args, cwd, COMMAND_TIMEOUT_MS, signal)
}

/**
 * Читает файл в UTF-8. Отсутствие файла — обычное состояние, поэтому `null`, а не исключение.
 * Любая другая причина (нет прав, по пути каталог и так далее) — это `DocumentUnreadableError`:
 * спецификация требует отличать «документа нет» (плейсхолдер «Создать документ») от
 * «документ не читается» (сообщение об ошибке с путём).
 */
export async function readTextFileWithNode(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return null
    throw new DocumentUnreadableError(path, e.message)
  }
}
