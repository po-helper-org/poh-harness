import type { BftLastSync } from './model.js'

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Разбирает содержимое `.bft/index/last-sync.json`.
 * Любой непригодный ввод — это `null`, а не исключение: панель обязана
 * рисоваться и без метки, показывая «Синхронизация ещё не запускалась».
 */
export function parseLastSync(raw: string | null): BftLastSync | null {
  if (!raw) return null

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null

  const record = data as Record<string, unknown>
  if (typeof record.at !== 'string' || !record.at) return null

  return {
    at: record.at,
    checkedRows: typeof record.checkedRows === 'number' ? record.checkedRows : 0,
    created: strings(record.created),
    promoted: strings(record.promoted),
    needsAttention: strings(record.needsAttention),
  }
}
