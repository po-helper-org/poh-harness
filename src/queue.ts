import {
  CANON_ORDER,
  HIDDEN_IN_QUEUE,
  QUEUE_ORDER,
  type BftPriority,
  type BftStage,
  type BftTaskSummary,
} from './model.js'

export interface BftGroup {
  stage: BftStage
  tasks: BftTaskSummary[]
}

const PRIORITY_WEIGHT: Record<BftPriority, number> = { high: 0, medium: 1, low: 2 }

/** Числовая часть идентификатора: PO-9 должен идти раньше PO-20. */
function numberOf(id: string): number {
  return Number.parseFloat(id.replace(/^[A-Z]+-/, '')) || 0
}

function byPriorityThenId(a: BftTaskSummary, b: BftTaskSummary): number {
  return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || numberOf(a.id) - numberOf(b.id)
}

function group(tasks: BftTaskSummary[], stages: readonly BftStage[], keepEmpty: boolean): BftGroup[] {
  return stages
    .map(stage => ({
      stage,
      tasks: tasks.filter(t => t.stage === stage).sort(byPriorityThenId),
    }))
    .filter(g => keepEmpty || g.tasks.length > 0)
}

/** Очередь панели: ближе к финалу выше, завершённое и отменённое скрыто, пустых групп нет. */
export function queueGroups(tasks: BftTaskSummary[]): BftGroup[] {
  const visible = tasks.filter(t => !HIDDEN_IN_QUEUE.has(t.stage))
  return group(visible, QUEUE_ORDER, false)
}

/** Доска: все стадии в хронологии, пустые колонки сохраняются. */
export function boardColumns(tasks: BftTaskSummary[]): BftGroup[] {
  return group(tasks, CANON_ORDER, true)
}

/** Поиск по названию и идентификатору, без учёта регистра. Пустой запрос ничего не фильтрует. */
export function searchTasks<T extends BftTaskSummary>(tasks: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return tasks
  return tasks.filter(t => `${t.title} ${t.id}`.toLowerCase().includes(q))
}
