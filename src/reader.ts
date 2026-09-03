import type { BftConfig } from './config.js'
import { BacklogFailedError, BacklogUnavailableError } from './errors.js'
import type { BftTask, BftTaskSummary } from './model.js'
import { parseTaskList } from './parse-list.js'
import { parseTaskView } from './parse-view.js'
import { readTextFileWithNode, runCommandWithNode, type ReadTextFile, type RunCommand } from './ports.js'

export interface BacklogReaderPorts {
  runCommand?: RunCommand
  readTextFile?: ReadTextFile
}

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
  async listTasks(): Promise<BftTaskSummary[]> {
    const stdout = await this.backlog(['task', 'list', '--plain'])
    return parseTaskList(stdout)
  }

  /** Полная карточка одного требования. */
  async getTask(id: string): Promise<BftTask> {
    const stdout = await this.backlog(['task', 'view', id, '--plain'])
    return parseTaskView(stdout)
  }

  /** Общий вызов CLI: различает «нет программы» и «программа вернула ошибку». */
  private async backlog(args: string[]): Promise<string> {
    const { backlogBin, workspaceRoot } = this.config
    const result = await this.runCommand(backlogBin, args, workspaceRoot)

    if (result.code === -1) throw new BacklogUnavailableError(backlogBin, result.stderr.trim())
    if (result.code !== 0) {
      throw new BacklogFailedError(`${backlogBin} ${args.join(' ')}`, result.code, result.stderr)
    }
    return result.stdout
  }
}
