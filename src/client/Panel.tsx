/**
 * Панель «Требования»: список БФТ-задач по каналу `/bft` (подкоманда `list`), сгруппированный
 * по стадиям через queueGroups() из ядра пакета (src/queue.ts) — своей группировки здесь нет.
 *
 * Регистрируется отдельной записью в слое оверлеев (`shell.overlay`, см. src/client/index.tsx).
 * Корневой элемент — сама панель (`.bft-panel`, стили и карта имён — Panel.styles.ts, текст CSS
 * инжектирует index.tsx в <style>, см. комментарий там же): слой оверлеев прозрачен для
 * указателя и передаёт pointer-events только прямым детям якоря записи (display:contents), так
 * что растянутый на весь экран корень перехватил бы клики по всему приложению вместо панели —
 * см. docs/client-wiring.md, §3.2. Поэтому .bft-panel сама задаёт себе геометрию
 * (top/right/bottom/width) и pointer-events: auto, а не оборачивается в inset:0-контейнер.
 *
 * Видимость держит стор слота из src/client/index.tsx (`panelStore`, @deepseek-ai/dsh-client-store) —
 * одна и та же регистрация `store:` стоит и у записи кнопки, и у записи этой панели, поэтому
 * `useStore`/`actions` синтезированы фреймворком и всегда согласованы. Пока `open` ложный,
 * компонент рендерит null: тогда в оверлее вообще нет узла панели и перехватывать клики нечему.
 *
 * Четыре состояния тела: загрузка (скелет той же геометрии, что и список — без прыжка
 * раскладки), список (группы по стадиям), пусто (список получен, требований нет) и ошибка
 * (текст ответа канала как есть + «Повторить»). Текст ошибки — из RpcResult.error.message,
 * он уже написан для пользователя на node-половине (src/channel.ts) и не переформулируется.
 */
// Type-only: даёт слияние SlotMap с записью 'shell.overlay' — нужно PropsRuntime<'shell.overlay'> ниже.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PropsStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RpcResult } from '../channel.js'
import type { BftStage, BftTaskSummary } from '../model.js'
import { queueGroups, type BftGroup } from '../queue.js'
// Type-only: PanelStoreHandle описывает форму стора, реальный хэндл создаётся в apply()
// (src/client/index.tsx) и сюда не импортируется — только тип, значение не пересекает границу.
import type { PanelStoreHandle } from './index.js'
// Не CSS-модуль (сборка стороннего плагина его не поддерживает — см. Panel.styles.ts):
// плоская карта «семантическое имя → класс», тот же текст инжектирует index.tsx в <style>.
import { panelClassNames as css } from './Panel.styles.js'

/** Собственный business-face панели: всё остальное (open/close) несёт общий со кнопкой стор. */
export interface RequirementsPanelInjected {
  listRequirements(signal: AbortSignal): Promise<RpcResult<unknown>>
  /**
   * Кнопка «Обновить»: цепочка connectWorkspace → scope → setDraft → open, собранная в
   * src/client/index.tsx (docs/client-wiring.md, §1.3). Открывает чат с подставленной
   * командой синка `/bft-needed-list` — без автоотправки, Enter жмёт PO. Промис отклоняется,
   * если цепочка не собралась (служба недоступна, нет рабочего пространства, sessions.scope
   * вернул undefined) — тогда панель остаётся открытой, см. onClick ниже.
   */
  openSyncChat(): Promise<void>
}

export type RequirementsPanelProps =
  PropsRuntime<'shell.overlay'> &
  PropsStore<PanelStoreHandle> &
  InjectFace<RequirementsPanelInjected> &
  PropsLocale<'bft.requirements'>

/** Тон стадии для полосы .item и точки .groupDot — цвета только из --dsw-*, как в прототипе. */
const STAGE_TONE: Record<BftStage, string> = {
  'To Do': 'var(--dsw-alias-label-caption)',
  'FAST-DONE': 'var(--dsw-alias-button-info-fill)',
  'REVIEW-DONE': 'var(--dsw-alias-button-info-fill)',
  'DEEP-WORK': 'var(--dsw-alias-button-info-fill)',
  'DEEP-REVIEW': 'var(--dsw-alias-state-warn-primary)',
  'DEEP-DONE': 'var(--dsw-alias-state-success-primary)',
  Cancelled: 'var(--dsw-alias-label-caption)',
}

type BodyState =
  | { phase: 'loading' }
  | { phase: 'ready'; groups: BftGroup[]; total: number }
  | { phase: 'empty' }
  | { phase: 'error'; message: string }

function toTaskSummaries(value: unknown): BftTaskSummary[] {
  if (!Array.isArray(value)) {
    console.error('[dsh-plugin-bft] list ответил не массивом:', value)
    return []
  }
  return value as BftTaskSummary[]
}

/** Панель раздела. Возвращает null, пока закрыта — тогда в оверлее нет узла, перехватывать нечего. */
export function RequirementsPanel({ useStore, actions, listRequirements, openSyncChat, t }: RequirementsPanelProps) {
  const isOpen = useStore(state => state.open)
  const [state, setState] = useState<BodyState>({ phase: 'loading' })
  const [collapsed, setCollapsed] = useState<ReadonlySet<BftStage>>(() => new Set())
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
        const groups = queueGroups(toTaskSummaries(result.value))
        const total = groups.reduce((sum, group) => sum + group.tasks.length, 0)
        setState(total === 0 ? { phase: 'empty' } : { phase: 'ready', groups, total })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
      })
  }, [listRequirements])

  useEffect(() => {
    if (!isOpen) return
    load()
    return () => { controllerRef.current?.abort() }
  }, [isOpen, load])

  if (!isOpen) return null

  const toggleGroup = (stage: BftStage) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  const badgeCount = state.phase === 'ready' ? state.total : state.phase === 'empty' ? 0 : undefined

  return (
    <aside className={css.panel} aria-label={t('panelTitle')}>
      <div className={css.header}>
        <h2>{t('panelTitle')}</h2>
        {badgeCount !== undefined && <span className={css.badge}>{badgeCount}</span>}
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('refresh')}
          onClick={() => {
            // Цепочка сама открывает чат и не отправляет ничего (см. openSyncChat в
            // src/client/index.tsx) — здесь только решаем, закрывать ли панель. Закрываем
            // единственно по успеху: если цепочка не собралась (служба недоступна, нет
            // рабочего пространства, sessions.scope вернул undefined), панель остаётся
            // открытой, а не молча исчезает без результата.
            void openSyncChat().then(
              () => { actions.close() },
              (error: unknown) => { console.error('[dsh-plugin-bft] sync chat:', error) },
            )
          }}
        >
          <RefreshIcon />
        </button>
        <button type="button" className={css.iconButton} aria-label={t('close')} onClick={() => { actions.close() }}>
          <CloseIcon />
        </button>
      </div>
      <div className={css.body}>
        {state.phase === 'loading' && <LoadingSkeleton label={t('loading')} />}
        {state.phase === 'error' && <ErrorState message={state.message} retryLabel={t('retry')} onRetry={load} />}
        {state.phase === 'empty' && <EmptyState title={t('empty')} hint={t('emptyHint')} />}
        {state.phase === 'ready' && (
          <GroupList groups={state.groups} collapsed={collapsed} onToggle={toggleGroup} />
        )}
      </div>
    </aside>
  )
}

function GroupList({ groups, collapsed, onToggle }: {
  groups: BftGroup[]
  collapsed: ReadonlySet<BftStage>
  onToggle: (stage: BftStage) => void
}) {
  return (
    <>
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.stage)
        const tone = { '--tone': STAGE_TONE[group.stage] } as CSSProperties
        return (
          <section key={group.stage} className={css.group} data-collapsed={isCollapsed}>
            <button
              type="button"
              className={css.groupHeader}
              aria-expanded={!isCollapsed}
              onClick={() => { onToggle(group.stage) }}
            >
              <span className={css.groupDot} style={tone} aria-hidden="true" />
              <span className={css.groupLabel}>{group.stage}</span>
              <span className={css.badge}>{group.tasks.length}</span>
              <span className={css.chevron} aria-hidden="true">▾</span>
            </button>
            <div className={css.groupBody}>
              {group.tasks.map(task => (
                <div key={task.id} className={css.item} style={tone}>
                  <div className={css.itemBody}>
                    {task.title}
                    <span className={css.itemId}>{task.id}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} style={{ display: 'contents' }}>
      {[0, 1, 2].map(key => (
        <div key={key} className={css.skeletonGroup}>
          <span className={`${css.skeletonBar} ${css.skeletonHead}`} />
          <span className={`${css.skeletonBar} ${css.skeletonLine}`} />
          <span className={`${css.skeletonBar} ${css.skeletonLine}`} />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className={css.stateBlock}>
      <span className={css.stateIcon} aria-hidden="true"><EmptyIcon /></span>
      <h3 className={css.stateTitle}>{title}</h3>
      <p className={css.stateHint}>{hint}</p>
    </div>
  )
}

function ErrorState({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className={css.stateBlock}>
      <span className={css.stateIcon} data-tone="error" aria-hidden="true"><ErrorIcon /></span>
      <p className={css.stateMessage}>{message}</p>
      <button type="button" className={`${css.btn} ${css.btnOutline}`} onClick={onRetry}>{retryLabel}</button>
    </div>
  )
}

function EmptyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 8.5 5 3h10l2 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path
        d="M3 8.5h4.2c.3 0 .5.2.6.4l.4 1c.1.3.4.5.7.5h2.2c.3 0 .6-.2.7-.5l.4-1c.1-.2.3-.4.6-.4H17"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M3 8.5v6A1.5 1.5 0 0 0 4.5 16h11a1.5 1.5 0 0 0 1.5-1.5v-6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
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

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 4.5A5.5 5.5 0 1 0 14.2 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M13 2v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
