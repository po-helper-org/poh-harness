/**
 * Доска по стадиям (Task 4 плана «Панель целиком и превью»): полноэкранная страница поверх
 * приложения, тот же приём, что и детальная страница (Task 3, DetailPage.tsx) — `position:
 * fixed; inset: 0` (класс `.${css.detailPage}`, переиспользован как есть), не второй слой
 * оверлеев `shell.overlay`, а ветка того же уже смонтированного slot-компонента
 * `RequirementsPanel` (см. `route.view === 'board'` в Panel.tsx).
 *
 * Список — независимый запрос по каналу `/bft` (подкоманда `list`, тот же `listRequirements`,
 * которым грузится список панели, см. index.tsx), не переиспользует уже загруженное состояние
 * панели: тело панели хранит только `queueGroups()` — хронологию очереди без Cancelled/
 * DEEP-DONE и без пустых колонок, а доске нужны все семь стадий из `boardColumns()`
 * (src/queue.ts), включая пустые. Тот же приём, каким уже пользуются Preview.tsx и
 * DetailPage.tsx для собственной загрузки: `useState` + `useEffect` + `AbortController`, три
 * состояния loading/ready/error — отдельного «пусто» не заводим, доска и так показывает семь
 * колонок с нулевыми счётчиками, когда задач нет.
 *
 * Карточка несёт только `BftTaskSummary` (id/title/stage/priority) — этого достаточно для
 * названия и идентификатора, полную задачу доска не грузит. Клик переключает панель на
 * детальную страницу (Task 3): у неё нет объекта задачи, только id карточки, но DetailPage
 * сама догружает задачу по id независимо от источника открытия (см. комментарий в шапке
 * DetailPage.tsx) — доске не нужно ничего готовить заранее.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { RpcResult } from '../channel.js'
import type { BftTaskSummary } from '../model.js'
import { boardColumns, type BftGroup } from '../queue.js'
import type { BftLocaleKey } from './locales.js'
import { panelClassNames as css } from './Panel.styles.js'
import { STAGE_TONE } from './stage-tone.js'

export interface BoardProps {
  t: (key: BftLocaleKey) => string
  /** Канал `/bft`, подкоманда `list` — тот же вызов, что грузит список панели (см. index.tsx). */
  listRequirements(signal: AbortSignal): Promise<RpcResult<unknown>>
  /** Открывает детальную страницу требования (Task 3) — переключает режим панели, живёт в Panel.tsx. */
  onOpenDetail(id: string): void
  /** Стрелка «← Назад»: возвращает панель к списку. */
  onBack(): void
}

type BoardState =
  | { phase: 'loading' }
  | { phase: 'ready'; groups: BftGroup[] }
  | { phase: 'error'; message: string }

/** Тот же приём защиты от мусора на проводе, что toTaskSummaries() в Panel.tsx — дублируем его
 * здесь по тому же принципу, по которому Preview.tsx/DetailPage.tsx дублируют toTask(): это
 * локальная охрана типа на границе провода, а не переиспользуемая утилита ядра. */
function toTaskSummaries(value: unknown): BftTaskSummary[] {
  if (!Array.isArray(value)) {
    console.error('[dsh-plugin-bft] list ответил не массивом:', value)
    return []
  }
  return value as BftTaskSummary[]
}

export function Board({ t, listRequirements, onOpenDetail, onBack }: BoardProps) {
  const [state, setState] = useState<BoardState>({ phase: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ phase: 'loading' })
    listRequirements(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (!result.ok) {
          setState({ phase: 'error', message: result.error.message })
          return
        }
        setState({ phase: 'ready', groups: boardColumns(toTaskSummaries(result.value)) })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
      })
  }, [listRequirements])

  // Загрузка запускается один раз при монтировании (доска — отдельная ветка рендера Panel.tsx,
  // монтируется заново при каждом открытии) и обрывается при размонтировании — тот же приём,
  // что useEffect загрузки задачи в DetailPage.tsx. Повторное открытие доски создаёт новый
  // компонент (React размонтирует старый при переключении ветки route.view), поэтому старый
  // AbortController не может пережить новое открытие и погнаться за него результатом.
  useEffect(() => {
    load()
    return () => { controllerRef.current?.abort() }
  }, [load])

  return (
    <div className={css.detailPage}>
      <div className={css.header}>
        <button type="button" className={css.iconButton} aria-label={t('detailBack')} onClick={onBack}>
          <BackIcon />
        </button>
        <h2>{t('boardHeaderTitle')}</h2>
      </div>

      {state.phase !== 'ready' && (
        <div className={css.body}>
          {state.phase === 'loading' && (
            <div className={css.stateBlock} aria-busy="true">
              <p className={css.stateMessage}>{t('loading')}</p>
            </div>
          )}
          {state.phase === 'error' && (
            <div className={css.stateBlock}>
              <span className={css.stateIcon} data-tone="error" aria-hidden="true"><ErrorIcon /></span>
              <p className={css.stateMessage}>{state.message}</p>
              <button type="button" className={`${css.btn} ${css.btnOutline}`} onClick={load}>
                {t('retry')}
              </button>
            </div>
          )}
        </div>
      )}

      {state.phase === 'ready' && (
        <div className={css.boardRow}>
          {state.groups.map(group => (
            <BoardColumn key={group.stage} group={group} onSelect={onOpenDetail} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Одна колонка стадии: заголовок (та же геометрия точки/подписи/счётчика, что и `.groupHeader`
 * списка панели — `.groupDot`/`.groupLabel`/`.badge` переиспользованы как есть) прилипает
 * сверху естественным образом — он вне скроллящегося тела колонки (`flex: none` над `flex: 1;
 * overflow-y: auto`), а не через `position: sticky`. Карточки — существующие `.item`/
 * `.itemBody`/`.itemId` списка панели (название + id, цветная полоса стадии слева через
 * `--tone`) — тот же приём, что `GroupList` в Panel.tsx, отдельного класса карточки не заводим.
 */
function BoardColumn({ group, onSelect }: { group: BftGroup; onSelect: (id: string) => void }) {
  const tone = { '--tone': STAGE_TONE[group.stage] } as CSSProperties
  return (
    <section className={css.boardColumn}>
      <div className={css.boardColumnHeader}>
        <span className={css.groupDot} style={tone} aria-hidden="true" />
        <span className={css.groupLabel}>{group.stage}</span>
        <span className={css.badge}>{group.tasks.length}</span>
      </div>
      <div className={css.boardColumnBody}>
        {group.tasks.map(task => (
          <button
            key={task.id}
            type="button"
            className={css.item}
            style={tone}
            onClick={() => { onSelect(task.id) }}
          >
            <div className={css.itemBody}>
              {task.title}
              <span className={css.itemId}>{task.id}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M8.5 2.5 3 7l5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6.2v4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="13.4" r="0.9" fill="currentColor" />
    </svg>
  )
}
