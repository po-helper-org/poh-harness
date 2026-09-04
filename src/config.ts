/**
 * Конфигурация плагина: пути воркспейса, адреса внешних систем, доступы.
 *
 * Функция чистая — окружение приходит параметром, а не читается из `process.env`.
 * Так ядро остаётся без ввода-вывода и тестируется без подмены глобальных объектов;
 * `process.env` подставляет host-слой в точке запуска.
 *
 * Секретов в этом файле нет и быть не может: токены живут только в окружении.
 */

/** Доступ к внешней системе. Токена может не быть — тогда работают только ссылки. */
export interface BftServiceAccess {
  /** Базовый адрес, например https://jira.mts.ru */
  baseUrl: string
  /** Токен из окружения. `undefined` — система доступна только как ссылки в интерфейсе. */
  token?: string
}

export interface BftConfig {
  /** Корень воркспейса: внутри него лежат `backlog/`, `bft/documentation/`, `bft/index/`. */
  workspaceRoot: string
  /** Исполняемый файл Backlog.md. Обычно просто `backlog` из PATH. */
  backlogBin: string
  /** Каталог с документами БФТ, относительно корня воркспейса. */
  docsPath: string
  /** Каталог индекса БФТ, относительно корня воркспейса. Там же лежит `last-sync.json`. */
  indexPath: string
  /**
   * Рабочее пространство по умолчанию для чатов по требованиям, относительно корня
   * воркспейса. Именно к этому каталогу привязываются сессии мини-чата детальной страницы
   * (MiniChat.tsx): агент оказывается прямо там, где лежат документы БФТ, а сами диалоги
   * группируются в отдельное рабочее пространство и не смешиваются с общими чатами.
   *
   * Пустая строка означает «не привязывать» — тогда мини-чат откатывается к текущему
   * рабочему пространству харнесса, ровно как вёл себя до появления этой настройки.
   */
  sessionPath: string
  /** Тип задач Backlog.md, который считается требованием БФТ. */
  taskType: string
  /** Значение колонки Team в таблице инициатив, которое считается нашей командой. */
  teamName: string
  /** Таблица продуктовых инициатив — источник для синхронизации. */
  initiativesSheetUrl?: string
  jira: BftServiceAccess
  confluence: BftServiceAccess
}

/** Значения по умолчанию — рабочие без единой переменной окружения, кроме корня воркспейса. */
const DEFAULTS = {
  backlogBin: 'backlog',
  docsPath: 'bft/documentation',
  indexPath: 'bft/index',
  // Внутренняя папка bft — рабочее пространство по умолчанию для чатов по требованиям:
  // тот же каталог, внутри которого уже лежат documentation/ и index/.
  sessionPath: 'bft',
  taskType: 'bft',
  teamName: 'GDS/Платформа',
  jiraBaseUrl: 'https://jira.mts.ru',
  confluenceBaseUrl: 'https://confluence.mts.ru',
} as const

export type Env = Record<string, string | undefined>

/** Пустая строка в окружении равносильна незаданной переменной. */
function value(env: Env, name: string): string | undefined {
  const raw = env[name]
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Собирает конфигурацию из окружения.
 * Бросает ошибку только на `BFT_WORKSPACE_ROOT` — без него плагину нечего читать,
 * а угадывать корень чужого воркспейса опаснее, чем упасть сразу и явно.
 */
export function loadConfig(env: Env): BftConfig {
  const workspaceRoot = value(env, 'BFT_WORKSPACE_ROOT')
  if (!workspaceRoot) {
    throw new Error(
      'не задан BFT_WORKSPACE_ROOT — укажите корень воркспейса, где лежат backlog/ и bft/',
    )
  }

  return {
    workspaceRoot,
    backlogBin: value(env, 'BFT_BACKLOG_BIN') ?? DEFAULTS.backlogBin,
    docsPath: value(env, 'BFT_DOCS_PATH') ?? DEFAULTS.docsPath,
    indexPath: value(env, 'BFT_INDEX_PATH') ?? DEFAULTS.indexPath,
    // Отдельно от value(): здесь пустая строка — не «переменная не задана», а осмысленное
    // «не привязывать сессии никуда». Поэтому смотрим на само наличие ключа, а не на
    // непустоту значения, иначе выключить привязку через окружение было бы нечем.
    sessionPath: env['BFT_SESSION_PATH'] === undefined
      ? DEFAULTS.sessionPath
      : env['BFT_SESSION_PATH'].trim(),
    taskType: value(env, 'BFT_TASK_TYPE') ?? DEFAULTS.taskType,
    teamName: value(env, 'BFT_TEAM_NAME') ?? DEFAULTS.teamName,
    initiativesSheetUrl: value(env, 'BFT_INITIATIVES_SHEET_URL'),
    jira: {
      baseUrl: value(env, 'JIRA_HOST') ?? DEFAULTS.jiraBaseUrl,
      token: value(env, 'JIRA_TOKEN'),
    },
    confluence: {
      baseUrl: value(env, 'CONFLUENCE_HOST') ?? DEFAULTS.confluenceBaseUrl,
      token: value(env, 'CONFLUENCE_TOKEN'),
    },
  }
}

/**
 * Человекочитаемая сводка о конфигурации — для диагностики в интерфейсе и логах.
 * Токены не печатает никогда: только факт наличия. Значение токена не должно попадать
 * ни в лог, ни в сообщение об ошибке, ни в отчёт.
 */
export function describeConfig(config: BftConfig): string[] {
  return [
    `воркспейс: ${config.workspaceRoot}`,
    `backlog: ${config.backlogBin}`,
    `документы: ${config.docsPath}`,
    `индекс: ${config.indexPath}`,
    `рабочее пространство чатов: ${config.sessionPath === '' ? 'не привязано (текущее)' : config.sessionPath}`,
    `тип задач: ${config.taskType}`,
    `команда: ${config.teamName}`,
    `таблица инициатив: ${config.initiativesSheetUrl ?? 'не задана'}`,
    `JIRA: ${config.jira.baseUrl}, токен ${config.jira.token ? 'задан' : 'не задан'}`,
    `Confluence: ${config.confluence.baseUrl}, токен ${config.confluence.token ? 'задан' : 'не задан'}`,
  ]
}
