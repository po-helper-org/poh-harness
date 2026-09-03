import z from '@deepseek-ai/schemastery'
import type { BftConfig, Env } from './config.js'

/**
 * Конфигурация из строки профиля харнесса.
 * Секретов здесь нет и быть не может: строка профиля лежит в файле рядом с репозиторием.
 */
export interface PluginConfig {
  workspaceRoot: string
  backlogBin: string
  docsPath: string
  indexPath: string
  taskType: string
  teamName: string
}

export const Config = z.object({
  workspaceRoot: z.string().required(),
  backlogBin: z.string().default('backlog'),
  docsPath: z.string().default('.bft/documentation'),
  indexPath: z.string().default('.bft/index'),
  taskType: z.string().default('bft'),
  teamName: z.string().default('GDS/Платформа'),
})

/** Пути приходят строкой профиля, адреса и токены внешних систем — из окружения. */
export function toBftConfig(plugin: PluginConfig, env: Env): BftConfig {
  // Схема пропускает пустую строку: `.required()` проверяет наличие ключа, а не содержимое.
  // Пустой корень означал бы запуск команд в неверном каталоге, поэтому падаем сразу и явно.
  const workspaceRoot = plugin.workspaceRoot?.trim()
  if (!workspaceRoot) {
    throw new Error(
      'в настройках плагина не задан workspaceRoot — укажите корень воркспейса, где лежат backlog/ и .bft/',
    )
  }

  const value = (name: string): string | undefined => {
    const raw = env[name]
    const trimmed = raw?.trim()
    return trimmed ? trimmed : undefined
  }

  return {
    workspaceRoot,
    backlogBin: plugin.backlogBin,
    docsPath: plugin.docsPath,
    indexPath: plugin.indexPath,
    taskType: plugin.taskType,
    teamName: plugin.teamName,
    initiativesSheetUrl: value('BFT_INITIATIVES_SHEET_URL'),
    jira: {
      baseUrl: value('JIRA_HOST') ?? 'https://jira.mts.ru',
      token: value('JIRA_TOKEN'),
    },
    confluence: {
      baseUrl: value('CONFLUENCE_HOST') ?? 'https://confluence.mts.ru',
      token: value('CONFLUENCE_TOKEN'),
    },
  }
}
