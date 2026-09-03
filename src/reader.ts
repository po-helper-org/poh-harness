import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { BftConfig } from './config.js'
import {
  BacklogFailedError,
  BacklogTimeoutError,
  BacklogUnavailableError,
  DocumentOutsideWorkspaceError,
  InvalidTaskIdError,
  TaskNotFoundError,
} from './errors.js'
import { parseLastSync } from './last-sync.js'
import type { BftLastSync, BftTask, BftTaskSummary } from './model.js'
import { parseTaskList } from './parse-list.js'
import { parseTaskView } from './parse-view.js'
import {
  readTextFileWithNode,
  runCommandWithNode,
  type CommandResult,
  type ReadTextFile,
  type RunCommand,
} from './ports.js'

export interface BacklogReaderPorts {
  runCommand?: RunCommand
  readTextFile?: ReadTextFile
}

/** Формат идентификатора задачи Backlog.md: буквенный префикс, дефис, число (возможно, с подномером через точку). */
const TASK_ID_RE = /^[A-Za-z]+-[\d.]+$/

/**
 * Достаёт данные требований из воркспейса.
 * Внешний мир доступен только через порты — так поведение проверяется без живого CLI,
 * а подмена в тестах не требует трогать глобальные объекты.
 */
export class BacklogReader {
  private readonly runCommand: RunCommand
  private readonly readTextFile: ReadTextFile

  constructor(private readonly config: BftConfig, ports: BacklogReaderPorts = {}) {
    this.runCommand = ports.runCommand ?? runCommandWithNode
    this.readTextFile = ports.readTextFile ?? readTextFileWithNode
  }

  /** Очередь требований: только задачи настроенного типа, стадия из заголовка группы. */
  async listTasks(signal?: AbortSignal): Promise<BftTaskSummary[]> {
    const result = await this.backlog(['task', 'list', '--plain'], signal)
    return parseTaskList(result.stdout, this.config.taskType)
  }

  /** Полная карточка одного требования. */
  async getTask(id: string, signal?: AbortSignal): Promise<BftTask> {
    // Идентификатор приходит от пользователя интерфейса и проверяется до похода в CLI:
    // `backlog task view --help --plain` тоже отвечает кодом 0 и печатает справку, то есть
    // мусорный идентификатор без этой проверки дал бы «успешный» разбор мусора.
    if (!TASK_ID_RE.test(id)) throw new InvalidTaskIdError(id)

    // `--` перед позиционным идентификатором гарантирует, что backlog разберёт его как значение,
    // а не как флаг, даже если бы он каким-то путём обошёл проверку выше.
    const result = await this.backlog(['task', 'view', '--plain', '--', id], signal)
    if (isTaskNotFound(result, id)) throw new TaskNotFoundError(id)
    return parseTaskView(result.stdout)
  }

  /**
   * Читает `.html` артефакт требования.
   * Путь приходит из ссылок задачи, то есть из данных, поэтому проверяется дважды: лексически
   * (до похода на диск) и по настоящему пути после разрешения симлинков (после — потому что
   * симлинк внутри каталога документов может вести наружу, а строковая проверка пути этого не
   * увидит).
   * `signal` пока не на что прокинуть: `ReadTextFile` отмену не поддерживает. Параметр принят
   * для единообразия публичного API — тем же способом, что и остальные методы чтения.
   */
  async readDocument(relativePath: string, signal?: AbortSignal): Promise<string | null> {
    void signal

    const docsRoot = resolve(this.config.workspaceRoot, this.config.docsPath)
    const target = resolve(this.config.workspaceRoot, relativePath)

    if (isAbsolute(relativePath) || isOutside(docsRoot, target)) {
      throw new DocumentOutsideWorkspaceError(relativePath)
    }

    // Отсутствие цели — обычное дело (ENOENT), тогда сверяем путь как есть: нечему вести наружу.
    const realTarget = await realpath(target).catch(() => target)
    if (isOutside(docsRoot, realTarget)) {
      throw new DocumentOutsideWorkspaceError(relativePath)
    }

    return this.readTextFile(target)
  }

  /**
   * Метка последней синхронизации. Нет файла или он битый — `null`, панель рисуется без неё.
   * `signal` принят для единообразия с остальными методами чтения (см. `readDocument`).
   */
  async readLastSync(signal?: AbortSignal): Promise<BftLastSync | null> {
    void signal
    const path = join(this.config.workspaceRoot, this.config.indexPath, 'last-sync.json')
    return parseLastSync(await this.readTextFile(path))
  }

  /** Общий вызов CLI: различает «нет программы», «программа вернула ошибку» и «не уложились в таймаут». */
  private async backlog(args: string[], signal?: AbortSignal): Promise<CommandResult> {
    const { backlogBin, workspaceRoot } = this.config
    const result = await this.runCommand(backlogBin, args, workspaceRoot, signal)

    // Проверяется первым: даже код 0 не гарантирует полный вывод, если процесс остановлен
    // по таймауту (ребёнок мог заглушить SIGTERM и досчитать сам) — очередь не должна
    // отрисоваться неполной без единого признака проблемы.
    if (result.timedOut) throw new BacklogTimeoutError(`${backlogBin} ${args.join(' ')}`)
    if (result.code === -1) throw new BacklogUnavailableError(backlogBin, result.stderr.trim())
    if (result.code !== 0) {
      throw new BacklogFailedError(`${backlogBin} ${args.join(' ')}`, result.code, result.stderr)
    }
    return result
  }
}

/** `true`, если `target` лежит вне `root`. Не `startsWith('..')` — это отвергло бы легальный
 *  путь вида `..hidden/x.html`, где `..` просто первые символы имени, а не переход наружу. */
function isOutside(root: string, target: string): boolean {
  const inside = relative(root, target)
  return isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)
}

/**
 * Живой `backlog task view <id> --plain` на несуществующей задаче отвечает кодом 0 и текстом
 * «Task <id> not found.» — не в stdout, а в stderr, поэтому смотрим в оба потока.
 */
function isTaskNotFound(result: CommandResult, id: string): boolean {
  const marker = `Task ${id} not found`
  return result.stdout.includes(marker) || result.stderr.includes(marker)
}
