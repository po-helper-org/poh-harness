/** Стадии проработки БФТ. Порядок объявления — канонический, хронологический. */
export const CANON_ORDER = [
  'To Do',
  'FAST-DONE',
  'REVIEW-DONE',
  'DEEP-WORK',
  'DEEP-REVIEW',
  'DEEP-DONE',
  'Cancelled',
] as const

export type BftStage = (typeof CANON_ORDER)[number]

/**
 * Порядок в панели требований: ближе к финалу — выше, чтобы PO дожимал
 * почти готовое. Это рабочая очередь, а не витрина статусов.
 */
export const QUEUE_ORDER = [
  'DEEP-REVIEW',
  'DEEP-WORK',
  'REVIEW-DONE',
  'FAST-DONE',
  'To Do',
] as const

/** В очередь не попадают: работа по ним закончена. */
export const HIDDEN_IN_QUEUE: ReadonlySet<BftStage> = new Set(['DEEP-DONE', 'Cancelled'])

export type BftPriority = 'high' | 'medium' | 'low'

/** Ссылки из `--ref`, разложенные по видам. Нераспознанное не теряем — оно в `other`. */
export interface BftLinks {
  confluence?: string
  epic?: string
  okr?: string
  html?: string
  other: string[]
}

/** Строка списка: всё, что видно в панели без открытия задачи. */
export interface BftTaskSummary {
  id: string
  title: string
  stage: BftStage
  priority: BftPriority
}

/** Полная задача: то, что показывает превью и карточка. */
export interface BftTask extends BftTaskSummary {
  description: string
  smart?: string
  howToDemo: string[]
  links: BftLinks
  cancelReason?: string
}

/** Метка последней синхронизации из `.bft/index/last-sync.json`. */
export interface BftLastSync {
  at: string
  checkedRows: number
  created: string[]
  promoted: string[]
  needsAttention: string[]
}
