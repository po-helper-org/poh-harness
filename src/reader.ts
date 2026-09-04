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
import { epicSlugFromRefs, rankCandidates, type DocumentCandidate } from './document-source.js'
import { parseLastSync } from './last-sync.js'
import type { BftLastSync, BftTask, BftTaskSummary } from './model.js'
import { parseTaskList } from './parse-list.js'
import { parseTaskView } from './parse-view.js'
import type { LinkHosts } from './classify-links.js'
import {
  listDirectoryWithNode,
  readTextFileWithNode,
  runCommandWithNode,
  type CommandResult,
  type ListDirectory,
  type ReadTextFile,
  type RunCommand,
} from './ports.js'

/** `JIRA_HOST`/`CONFLUENCE_HOST` are full URLs; `classifyLinks` compares bare hostnames. */
function hostnameOf(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) return undefined
  try {
    return new URL(baseUrl).hostname
  } catch {
    return undefined
  }
}

export interface BacklogReaderPorts {
  runCommand?: RunCommand
  readTextFile?: ReadTextFile
  listDirectory?: ListDirectory
}

/** Найденный документ требования вместе с признаком, как его показывать. */
export interface BftDocument {
  /** Путь относительно корня воркспейса — его же показываем в диагностике. */
  path: string
  kind: 'html' | 'markdown'
  content: string
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
  private readonly listDirectory: ListDirectory

  constructor(private readonly config: BftConfig, ports: BacklogReaderPorts = {}) {
    this.runCommand = ports.runCommand ?? runCommandWithNode
    this.readTextFile = ports.readTextFile ?? readTextFileWithNode
    this.listDirectory = ports.listDirectory ?? listDirectoryWithNode
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
    const hosts: LinkHosts = {
      jiraHost: hostnameOf(this.config.jira.baseUrl),
      confluenceHost: hostnameOf(this.config.confluence.baseUrl),
    }
    return parseTaskView(result.stdout, this.config.docsPath, hosts)
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
   * Находит и читает документ требования по конвенции каталогов.
   *
   * Ссылки задачи используются только чтобы понять папку эпика — не как точный путь к файлу.
   * Поэтому связка не ломается, когда навык меняет формат ссылок, переименовывает каталог
   * или вовсе не регистрирует сгенерированный HTML: пока хоть одна ссылка ведёт внутрь
   * `docsPath`, DSH сам найдёт всё, что лежит в папке эпика.
   *
   * `null` — показывать нечего (нет папки или она пуста); вызывающая сторона рисует
   * плейсхолдер с диагностикой, а не пустой экран.
   */
  async findDocument(id: string, signal?: AbortSignal): Promise<BftDocument | null> {
    const task = await this.getTask(id, signal)
    return this.findDocumentForTask(task)
  }

  /** Тот же поиск для уже загруженной задачи — без повторного похода в CLI. */
  async findDocumentForTask(task: BftTask): Promise<BftDocument | null> {
    const refs = [...task.links.other]
    // Порядок важен: явно распознанный html — самая надёжная зацепка за папку эпика.
    if (task.links.html !== undefined) refs.unshift(task.links.html)

    const slug = epicSlugFromRefs(refs, this.config.docsPath)
    if (slug === null) return null

    const dir = resolve(this.config.workspaceRoot, this.config.docsPath, slug)
    const entries = await this.listDirectory(dir)
    if (entries.length === 0) return null

    for (const candidate of rankCandidates(slug, entries, this.config.docsPath)) {
      const content = await this.readCandidate(candidate)
      if (content !== null) return { path: candidate.path, kind: candidate.kind, content }
    }
    return null
  }

  /** Нечитаемый кандидат не обрывает поиск: пробуем следующий по рангу. */
  private async readCandidate(candidate: DocumentCandidate): Promise<string | null> {
    try {
      const content = await this.readDocument(candidate.path)
      return content !== null && content.trim() !== '' ? content : null
    } catch {
      return null
    }
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

  /**
   * Абсолютный путь рабочего пространства по умолчанию для чатов по требованиям
   * (`sessionPath` в конфигурации). Клиенту нужен именно абсолютный: рабочие пространства
   * харнесса адресуются полным путём каталога, а относительный `bft` браузер разрешить не
   * может — корень воркспейса знает только node-половина.
   *
   * `null` — привязка выключена (пустой `sessionPath`); тогда мини-чат ведёт себя как прежде
   * и создаёт сессию в текущем рабочем пространстве харнесса.
   *
   * Путь только собирается, но не проверяется на существование: каталог мог быть ещё не
   * создан, и решение «создавать ли» принадлежит стороне, которая заводит рабочее
   * пространство, а не читателю. Выход за пределы воркспейса отвергается — `sessionPath`
   * приходит строкой профиля, и `../..` в нём привязал бы чаты к чужому каталогу.
   */
  resolveSessionPath(): string | null {
    const configured = this.config.sessionPath.trim()
    if (configured === '') return null
    const root = resolve(this.config.workspaceRoot)
    const target = resolve(root, configured)
    if (target !== root && !target.startsWith(root + sep)) {
      throw new DocumentOutsideWorkspaceError(configured)
    }
    return target
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
