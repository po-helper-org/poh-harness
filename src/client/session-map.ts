/**
 * Карта «требование → сессия мини-чата» (localStorage), по образцу соседнего task-cache.ts:
 * тот же приём хранения и та же защита от приватного режима/битого JSON.
 *
 * Зачем она вообще: мини-чат детальной страницы (MiniChat.tsx) ведёт правки по конкретному
 * БФТ в отдельной сессии — у каждого требования свой изолированный диалог, чтобы контекст
 * разных БФТ не смешивался. Без этой карты каждое открытие страницы заводило бы новую
 * сессию, и история правок по требованию терялась бы при закрытии страницы.
 *
 * Хранится только соответствие идентификаторов. Ни текстов, ни содержимого диалога здесь нет:
 * сам диалог живёт на хосте, это лишь указатель на него.
 *
 * Запись может протухнуть: сессию удалили из основного интерфейса, база сессий переехала,
 * запись пережила переустановку. Поэтому читающая сторона (index.tsx) обязана проверить
 * найденный id по актуальному списку сессий и, если его там нет, завести новую сессию —
 * см. `forgetRequirementSession` ниже. Протухшая запись это не ошибка, а обычное состояние.
 */

const MAP_KEY = 'dsh-plugin-bft:mini-chat-sessions:v1'

/** Плоская карта `taskId → sessionId`; значения — непрозрачные строки-идентификаторы сессий. */
type SessionMap = Record<string, string>

function readMap(): SessionMap {
  try {
    const raw = localStorage.getItem(MAP_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    // Массив/строка/null тоже успешно парсятся из JSON — годится только простой объект.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    // Значения проверяем поштучно: одна битая запись не должна обесценивать всю карту.
    const map: SessionMap = {}
    for (const [taskId, sessionId] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof sessionId === 'string' && sessionId !== '') map[taskId] = sessionId
    }
    return map
  } catch {
    // Приватный режим, отключённый storage, битый JSON — карты просто нет, не ошибка.
    return {}
  }
}

function writeMap(map: SessionMap): void {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map))
  } catch {
    // Квота/приватный режим — карта не переживёт эту загрузку страницы. Мини-чат от этого
    // не ломается: он просто заведёт новую сессию при следующем открытии страницы.
  }
}

/** Сессия мини-чата для требования, если она за ним уже закреплена. */
export function readRequirementSession(taskId: string): string | undefined {
  return readMap()[taskId]
}

/** Закрепить сессию за требованием (перезаписывает прежнюю привязку, если она была). */
export function writeRequirementSession(taskId: string, sessionId: string): void {
  const map = readMap()
  map[taskId] = sessionId
  writeMap(map)
}

/**
 * Снять привязку — зовётся, когда закреплённой сессии больше нет в списке хоста.
 * Отсутствие записи здесь и так штатно, поэтому «нечего забывать» не считается ошибкой.
 */
export function forgetRequirementSession(taskId: string): void {
  const map = readMap()
  if (!(taskId in map)) return
  delete map[taskId]
  writeMap(map)
}
