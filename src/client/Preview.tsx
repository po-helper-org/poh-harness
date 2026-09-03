/**
 * Превью требования (Task 2 плана «Панель целиком и превью»): по клику на строку списка
 * (`Panel.tsx`, `GroupList`) панель переключается в этот режим вместо списка — тот же
 * корневой `.bft-panel`, см. ветку `route.view === 'preview'` в `RequirementsPanel` (Task 3
 * добавил туда же третий режим, `'detail'`, — см. DetailPage.tsx).
 *
 * Данные — отдельный запрос по каналу `/bft` (подкоманда `task`, см. `getTask` в
 * src/client/index.tsx и `dispatch()` в src/parse-view.ts), не связан с уже загруженным
 * списком: список отдаёт только `BftTaskSummary` (id/title/stage/priority), а превью показывает
 * полную `BftTask` (описание, SMART, HowToDemo, ссылки) — этих полей в ответе `list` нет.
 *
 * Три состояния тела: загрузка / загружено / ошибка (текст канала как есть + «Повторить»,
 * код `task-not-found` — свой текст с предложением вернуться к списку, тот же приём, что и
 * в Panel.tsx для состояния `error` списка).
 *
 * Заполненные необязательные поля (заказчик, Confluence, эпик, OKR, HTML, SMART, HowToDemo)
 * показаны отдельными строками; отсутствующие среди них не рисуются пустыми — сворачиваются
 * в одну строку «Не заполнено: …» внизу блока полей. Причина отмены — бонусом, только когда
 * задача в стадии Cancelled и причина действительно есть; в «Не заполнено» не попадает — это
 * не универсальное поле, у остальных стадий её в принципе не бывает (см. parse-view.ts).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { RpcResult } from '../channel.js'
import type { BftTask } from '../model.js'
import type { BftLocaleKey } from './locales.js'
import { panelClassNames as css } from './Panel.styles.js'
import { STAGE_TONE } from './stage-tone.js'

export interface PreviewProps {
  /** Идентификатор выбранной строки списка — по нему запрашивается полная задача. */
  id: string
  t: (key: BftLocaleKey) => string
  /** Канал `/bft`, подкоманда `task` — инжектируется из src/client/index.tsx. */
  getTask(id: string, signal: AbortSignal): Promise<RpcResult<unknown>>
  /**
   * Обобщённая цепочка «уйти в чат с черновиком» (см. index.tsx: `openChatWithDraft`, была
   * `openSyncChat` до задачи 2). Отправки нет ни при каких условиях — Enter жмёт PO.
   */
  openChatWithDraft(draft: string): Promise<void>
  /**
   * Открывает детальную страницу (Task 3, DetailPage.tsx) — переключает режим панели, живёт
   * локально в Panel.tsx (не в RequirementsPanelInjected: см. комментарий у route в Panel.tsx).
   */
  onOpenDetail(id: string): void
  /** Стрелка «назад»: возвращает панель к списку, не закрывая её. */
  onBack(): void
  /** Панель целиком — зовётся после успешного ухода в чат (см. handleChat ниже). */
  onClose(): void
}

type PreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; task: BftTask }
  | { phase: 'error'; code: string; message: string }

/** Ответ канала — уже объект нужной формы (dispatch() на node-половине это гарантирует),
 * но провод есть провод: явно отбраковываем мусор, а не падаем на .id where popup. */
function toTask(value: unknown): BftTask | null {
  if (typeof value !== 'object' || value === null) {
    console.error('[dsh-plugin-bft] task ответил не объектом:', value)
    return null
  }
  return value as BftTask
}

/**
 * Черновик «Работать в чате» — общий шаблон для превью и детальной страницы (Task 3,
 * DetailPage.tsx, кнопка «В чат» при пустом мини-промте): текст идентичен, поэтому вынесен
 * сюда один раз, а не переписан вторым местом.
 */
export function buildContinueDraft(task: BftTask): string {
  return `Продолжи работу над БФТ ${task.id} «${task.title}».\n`
    + `Стадия: ${task.stage}. Детали задачи — mcp__backlog__task_view ${task.id}.`
}

export function Preview({ id, t, getTask, openChatWithDraft, onOpenDetail, onBack, onClose }: PreviewProps) {
  const [state, setState] = useState<PreviewState>({ phase: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)
  // Кнопка «Работать в чате» не отправляет ничего сама (см. openChatWithDraft) — busy нужен
  // только для того, чтобы не дать нажать ещё раз, пока цепочка connectWorkspace→…→open не
  // отработала, и вернуть кнопку в исходное состояние, если она отклонилась с ошибкой.
  const [chatPending, setChatPending] = useState(false)

  const load = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ phase: 'loading' })
    getTask(id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (!result.ok) {
          setState({ phase: 'error', code: result.error.code, message: result.error.message })
          return
        }
        const task = toTask(result.value)
        // Код 'parse-error' — не с провода: сам ответ дошёл (result.ok), но форма не похожа
        // на задачу. Текст для него берётся из словаря на рендере (см. JSX ниже), а не здесь —
        // useCallback этого шага не должен зависеть от `t` (стабильность которого между
        // рендерами не гарантирована) и перезапускать загрузку без нужды.
        setState(task === null ? { phase: 'error', code: 'parse-error', message: '' } : { phase: 'ready', task })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ phase: 'error', code: 'internal', message: error instanceof Error ? error.message : String(error) })
      })
  }, [getTask, id])

  useEffect(() => {
    load()
    return () => { controllerRef.current?.abort() }
  }, [load])

  const handleChat = (task: BftTask) => {
    // Шаблон вынесен в buildContinueDraft() — тот же текст переиспользует детальная страница
    // (Task 3). Без автоотправки, Enter жмёт PO.
    const draft = buildContinueDraft(task)
    setChatPending(true)
    void openChatWithDraft(draft).then(
      () => { onClose() },
      (error: unknown) => {
        setChatPending(false)
        console.error('[dsh-plugin-bft] preview chat:', error)
      },
    )
  }

  return (
    <>
      <div className={css.header}>
        <button type="button" className={css.iconButton} aria-label={t('previewBack')} onClick={onBack}>
          <BackIcon />
        </button>
        <h2>{t('previewHeaderTitle')}</h2>
        <button type="button" className={css.iconButton} aria-label={t('close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {/* Ровно один растущий (flex:1) контейнер тела на состояние — .body для загрузки/ошибки,
          previewScroll для готовых данных (см. ниже): оба flex:1, вместе они разделили бы
          высоту панели пополам вместо того, чтобы один из них занял её целиком. */}
      {state.phase !== 'ready' && (
        <div className={css.body}>
          {state.phase === 'loading' && (
            <div className={css.stateBlock} aria-busy="true">
              <p className={css.stateMessage}>{t('previewLoading')}</p>
            </div>
          )}
          {state.phase === 'error' && state.code === 'task-not-found' && (
            <div className={css.stateBlock}>
              <span className={css.stateIcon} data-tone="error" aria-hidden="true"><ErrorIcon /></span>
              <p className={css.stateMessage}>{t('previewTaskNotFound')}</p>
              <button type="button" className={`${css.btn} ${css.btnOutline}`} onClick={onBack}>
                {t('previewBack')}
              </button>
            </div>
          )}
          {state.phase === 'error' && state.code !== 'task-not-found' && (
            <div className={css.stateBlock}>
              <span className={css.stateIcon} data-tone="error" aria-hidden="true"><ErrorIcon /></span>
              <p className={css.stateMessage}>{state.code === 'parse-error' ? t('previewParseError') : state.message}</p>
              <button type="button" className={`${css.btn} ${css.btnOutline}`} onClick={load}>
                {t('previewRetry')}
              </button>
            </div>
          )}
        </div>
      )}
      {state.phase === 'ready' && (
        <>
          <ReadyBody task={state.task} t={t} />
          <div className={css.previewFooter}>
            <button
              type="button"
              className={`${css.btn} ${css.btnPrimary}`}
              style={{ flex: 1 }}
              disabled={chatPending}
              onClick={() => { handleChat(state.task) }}
            >
              {t('previewChat')}
            </button>
            <button
              type="button"
              className={`${css.btn} ${css.btnOutline}`}
              onClick={() => { onOpenDetail(state.task.id) }}
            >
              {t('previewDetail')}
            </button>
          </div>
        </>
      )}
    </>
  )
}

function ReadyBody({ task, t }: { task: BftTask; t: (key: BftLocaleKey) => string }) {
  const tone = { '--tone': STAGE_TONE[task.stage] } as CSSProperties

  // Секции всегда существуют (PO: «замени "Не заполнено: …" — секции всегда должны
  // существовать, пустое поле — прочерк»): вместо накопления списка отсутствующих полей в
  // отдельную сводную строку внизу, каждое поле — своя строка всегда, `EMPTY` вместо ссылки/
  // текста, когда в задаче для него ничего нет. Заказчик — исключение: живёт только в шапке
  // (`.previewMeta` ниже), это не «раздел», а подпись рядом с id, так было и раньше.
  const EMPTY = '—'

  const fields: Array<{ label: string; value: ReactNode }> = [
    {
      label: t('previewStage'),
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className={css.groupDot} style={tone} aria-hidden="true" />
          {task.stage}
        </span>
      ),
    },
    { label: t('previewDescription'), value: <p>{task.description}</p> },
    {
      label: t('previewLinksConfluence'),
      value: task.links.confluence
        ? (
          <a className={css.previewLink} href={task.links.confluence} target="_blank" rel="noopener">
            {task.links.confluence}
          </a>
          )
        : EMPTY,
    },
    {
      label: t('previewLinksEpic'),
      value: task.links.epic
        ? (
          <a className={css.previewLink} href={task.links.epic} target="_blank" rel="noopener">
            {task.links.epic}
          </a>
          )
        : EMPTY,
    },
    { label: t('previewLinksOkr'), value: task.links.okr ?? EMPTY },
    { label: t('previewLinksHtml'), value: task.links.html ?? EMPTY },
    { label: t('previewSmart'), value: task.smart ? <p>{task.smart}</p> : EMPTY },
    {
      label: t('previewHowToDemo'),
      value: task.howToDemo.length > 0
        ? (
          <ol className={css.previewList}>
            {task.howToDemo.map((step, index) => <li key={index}>{step}</li>)}
          </ol>
          )
        : EMPTY,
    },
  ]

  // Причина отмены — не универсальное поле (бывает только у Cancelled, см. parse-view.ts):
  // строка появляется только у отменённых требований, а не всегда с прочерком у остальных —
  // у DEEP-WORK её отсутствие не пробел, это поле в принципе не про эту стадию.
  if (task.stage === 'Cancelled' && task.cancelReason) {
    fields.push({ label: t('previewCancelReason'), value: <p>{task.cancelReason}</p> })
  }

  return (
    <div className={css.previewScroll}>
      <h3 className={css.previewTitle}>{task.title}</h3>
      <div className={css.previewMeta}>
        {task.customer && <span>{task.customer}</span>}
        {task.customer && <span aria-hidden="true">·</span>}
        <span className={css.itemId}>{task.id}</span>
      </div>
      {fields.map(field => (
        <div key={field.label} className={css.previewField}>
          <div className={css.previewFieldLabel}>{field.label}</div>
          <div className={css.previewFieldValue}>{field.value}</div>
        </div>
      ))}
    </div>
  )
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M8.5 2.5 3 7l5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 2.5 11.5 11.5M11.5 2.5 2.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
