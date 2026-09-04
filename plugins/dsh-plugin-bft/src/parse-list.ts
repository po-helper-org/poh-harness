import { CANON_ORDER, type BftPriority, type BftStage, type BftTaskSummary } from './model.js'

const STAGES = new Set<string>(CANON_ORDER)
const GROUP_RE = /^(\S.*):$/
const ROW_RE = /^\s+(?:\[(HIGH|MEDIUM|LOW)\]\s+)?(?:\[(\w+)\]\s+)?([A-Z]+-[\d.]+)\s+-\s+(.+)$/

/** Служебный префикс, которым скилл помечает задачи при заведении. */
const TITLE_PREFIX = /^БФТ:\s*/

/**
 * Разбирает вывод `backlog task list --plain`.
 * Стадия берётся из заголовка группы: сам по себе ряд её не содержит.
 * Задачи не типа `taskType` и группы вне канона игнорируются. Тип задаётся параметром, а не
 * жёстко «bft», — `config.taskType` для того и существует, чтобы воркспейс мог называть свой
 * тип требований иначе.
 */
export function parseTaskList(stdout: string, taskType = 'bft'): BftTaskSummary[] {
  const normalized = stdout.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const out: BftTaskSummary[] = []
  let stage: BftStage | null = null

  for (const line of normalized.split('\n')) {
    const group = GROUP_RE.exec(line)
    if (group) {
      const name = group[1]
      stage = STAGES.has(name) ? (name as BftStage) : null
      continue
    }
    if (!stage) continue

    const row = ROW_RE.exec(line)
    if (!row || row[2] !== taskType) continue

    out.push({
      id: row[3],
      title: row[4].replace(TITLE_PREFIX, '').trim(),
      stage,
      priority: (row[1]?.toLowerCase() ?? 'medium') as BftPriority,
    })
  }
  return out
}
