/**
 * Мини-чат детальной страницы требования: быстрые правки документа, не уходя со страницы.
 *
 * Что он решает. До него правая колонка была «мини-промтом»: любое нажатие уводило основной
 * интерфейс харнесса в полноценный диалог (setDraft + sessions.open) и закрывало панель
 * требований. PO это ломало сценарий — правки нужны короткие и на месте, ровно чтобы не
 * отвлекаться на основное рабочее окно. Здесь отправка идёт прямо в сессию требования через
 * session.prompt() (см. sendToRequirement в index.tsx), без навигации и без черновиков.
 *
 * СОЗНАТЕЛЬНОЕ ОГРАНИЧЕНИЕ, о котором честно сказано в интерфейсе. Ответы агента здесь НЕ
 * показываются. Причина не в трудоёмкости, а в границе харнесса: окно событий сессии
 * открывается только когда сессия становится `list.current` (ClientSessions.followCurrent →
 * session.open()), а `open()` намеренно не входит в публичный ISession. Показать переписку
 * можно было бы лишь обойдя эту границу приведением к конкретному классу Session — то есть
 * опершись на непубличную деталь, которая вправе измениться в любом обновлении харнесса.
 * Вместо этого лента показывает только отправленные вами инструкции и статус хода, а для
 * чтения ответов есть явная кнопка перехода в основной чат.
 *
 * Отсюда же вытекает главный сигнал завершения: `running` (публичный, хост проталкивает его
 * в каждую сессию независимо от навигации). Переход true → false означает «ход закончился» —
 * DetailPage по нему перезагружает документ слева, и результат правки виден сразу.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BftTask } from '../model.js'
import type { BftLocaleKey } from './locales.js'
import { panelClassNames as css } from './Panel.styles.js'

/** Одна отправленная инструкция в локальной ленте. Хранится только у клиента: авторитетный
 *  журнал диалога живёт на хосте, лента — это подтверждение «моя правка ушла», а не копия. */
interface SentItem {
  id: number
  text: string
  /** `true`, пока отправка не подтверждена хостом; ошибка отправки переводит в `error`. */
  status: 'sending' | 'sent' | 'error'
  /** Текст ошибки отправки — показывается прямо на реплике, а не прячется в консоль. */
  error?: string
}

export interface MiniChatProps {
  task: BftTask
  t: (key: BftLocaleKey) => string
  /** Отправка в сессию требования без навигации (index.tsx). */
  sendToRequirement(taskId: string, text: string): Promise<void>
  /** Подписка на «агент занят» для этого требования; возвращает функцию отписки. */
  watchRequirementRunning(taskId: string, onChange: (running: boolean) => void): () => void
  /** Явный переход в основное окно — единственный способ прочитать ответы агента. */
  openRequirementInMainChat(taskId: string): Promise<void>
  /** Зовётся на переходе running true → false: ход закончился, документ пора перечитать. */
  onTurnFinished(): void
}

export function MiniChat({
  task, t, sendToRequirement, watchRequirementRunning, openRequirementInMainChat, onTurnFinished,
}: MiniChatProps) {
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<SentItem[]>([])
  const [running, setRunning] = useState(false)
  const nextId = useRef(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  // onTurnFinished держим в ref: подписка ниже не должна пересоздаваться из-за того, что
  // родитель передал новую функцию на очередном рендере (loadDoc в DetailPage меняется
  // вместе со своими зависимостями) — иначе каждая такая смена рвала бы наблюдение за ходом.
  const finishedRef = useRef(onTurnFinished)
  useEffect(() => { finishedRef.current = onTurnFinished }, [onTurnFinished])

  // Наблюдение за ходом. Интересует именно ФРОНТ спада true → false: «был занят, стал
  // свободен» = ход закончился. Стартовое `false` фронтом не считается, иначе документ
  // перезагружался бы на каждом открытии страницы без единой правки.
  const wasRunning = useRef(false)
  useEffect(() => {
    const dispose = watchRequirementRunning(task.id, (next) => {
      setRunning(next)
      if (wasRunning.current && !next) finishedRef.current()
      wasRunning.current = next
    })
    return dispose
  }, [task.id, watchRequirementRunning])

  // Лента прокручивается к последней реплике: при быстрых правках подряд свежая инструкция
  // не должна уезжать под нижнюю границу колонки.
  useEffect(() => {
    const node = listRef.current
    if (node !== null) node.scrollTop = node.scrollHeight
  }, [items])

  const send = useCallback(() => {
    const text = draft.trim()
    if (text === '') return
    const id = nextId.current++
    // Реплика появляется сразу, до ответа хоста: правка ощущается мгновенной, а её реальная
    // судьба (sent/error) дорисовывается следом на том же элементе.
    setItems(prev => [...prev, { id, text, status: 'sending' }])
    setDraft('')
    // Инструкция обогащается контекстом требования: сессия мини-чата может быть свежей и
    // ничего про этот БФТ не знать, а PO пишет коротко («поправь заголовок»), рассчитывая,
    // что адресат очевиден. Путь к документу и id задачи снимают эту неоднозначность.
    const docPath = task.links.html ?? '—'
    const prompt = `По БФТ ${task.id} «${task.title}» (${docPath}): ${text}\n`
      + `Детали — mcp__backlog__task_view ${task.id}.`
    void sendToRequirement(task.id, prompt).then(
      () => {
        setItems(prev => prev.map(item => (item.id === id ? { ...item, status: 'sent' } : item)))
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[dsh-plugin-bft] mini-chat send:', error)
        setItems(prev => prev.map(item => (
          item.id === id ? { ...item, status: 'error', error: message } : item
        )))
      },
    )
  }, [draft, sendToRequirement, task])

  return (
    <div className={css.miniChat}>
      <div className={css.previewFieldLabel}>{t('miniChatTitle')}</div>

      <div className={css.miniChatLog} ref={listRef}>
        {items.length === 0 && <p className={css.miniChatHint}>{t('miniChatEmpty')}</p>}
        {items.map(item => (
          <div key={item.id} className={css.miniChatItem} data-status={item.status}>
            <div className={css.miniChatItemText}>{item.text}</div>
            {item.status === 'error' && (
              <div className={css.miniChatItemError}>{t('miniChatSendFailed')}: {item.error}</div>
            )}
          </div>
        ))}
        {running && (
          <div className={css.miniChatStatus} aria-live="polite">
            <span className={css.miniChatSpinner} aria-hidden="true" />
            {t('miniChatRunning')}
          </div>
        )}
      </div>

      <textarea
        className={css.detailTextarea}
        placeholder={t('miniChatPlaceholder')}
        value={draft}
        onChange={(event) => { setDraft(event.target.value) }}
        onKeyDown={(event) => {
          // Enter отправляет, Shift+Enter — перенос строки: та же привычка, что в основном
          // композере харнесса. Здесь автоотправка уместна (в отличие от цепочки с setDraft,
          // где Enter принципиально оставался за человеком): это и есть поле чата, а не
          // подстановка черновика в чужое окно.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
      />

      <Button variant="primary" className={css.fullWidth} disabled={draft.trim() === ''} onClick={send}>
        {t('miniChatSend')}
      </Button>

      {/* Честная оговорка о границе: ответы агента здесь не видны, и это свойство, а не сбой.
          Кнопка рядом — единственный (и теперь осознанный) путь в основной чат. */}
      <p className={css.miniChatHint}>{t('miniChatNoRepliesHint')}</p>
      <Button
        variant="outline"
        className={css.fullWidth}
        onClick={() => {
          void openRequirementInMainChat(task.id).catch((error: unknown) => {
            console.error('[dsh-plugin-bft] mini-chat open main:', error)
          })
        }}
      >
        {t('miniChatOpenMain')}
      </Button>
    </div>
  )
}
