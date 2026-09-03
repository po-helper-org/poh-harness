/** Английский — источник истины: ключи остальных языков проверяются типом против него. */
export const en = {
  nav: 'Requirements',
  panelTitle: 'Requirements',
  close: 'Close',
  refresh: 'Refresh',
  loading: 'Loading requirements…',
  empty: 'No requirements yet',
  emptyHint: 'Run a sync to pull them from the initiatives table',
  retry: 'Retry',
} satisfies Record<string, string>

export const ru = {
  nav: 'Управление требованиями',
  panelTitle: 'Требования',
  close: 'Закрыть',
  refresh: 'Обновить',
  loading: 'Загружаю требования…',
  empty: 'Требований пока нет',
  emptyHint: 'Запусти синхронизацию, чтобы подтянуть их из таблицы инициатив',
  retry: 'Повторить',
} satisfies Record<keyof typeof en, string>

export type BftLocaleKey = keyof typeof en
