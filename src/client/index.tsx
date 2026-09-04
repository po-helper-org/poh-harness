/**
 * Раздел «Управление требованиями», браузерная половина.
 *
 * Регистрирует кнопку в подвале левой панели (`sidebar.footer.action`) и панель со списком
 * требований в слое оверлеев (`shell.overlay`, отдельная запись рядом с чужими — см.
 * docs/client-wiring.md, §3). Обе записи делят один и тот же стор слота (`panelStore`,
 * @deepseek-ai/dsh-client-store): кнопка читает и переключает `open` через `actions.toggle()`,
 * панель читает его через `useStore` и закрывается через `actions.close()`. Это то самое
 * «держать состояние в сторе слота» из плана задачи — общий `store:` на обеих регистрациях,
 * а не два независимых `useState`, так что кнопка и панель никогда не расходятся.
 *
 * Файл называется `index.tsx`, а не `index.ts`: он определяет JSX-разметку кнопки на месте,
 * а TypeScript разрешает JSX-грамматику только в `.tsx`.
 */
// Type-only: даёт декларацию `ctx.slots` в `Context` (@deepseek-ai/cordis).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: даёт слияние SlotMap с записью 'sidebar.footer.action'.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: даёт слияние SlotMap с записью 'shell.overlay' (панель регистрируется туда).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: даёт декларацию `ctx.locale` в `Context`.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: даёт декларацию `ctx.sessions` в `Context` + ISessions (цепочка запуска чата,
// docs/client-wiring.md §1.2-1.3). Не в export const inject ниже — служба ленивая (см. openChatWithDraft).
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'

/**
 * Идентификатор сессии, выведенный из самой службы, а не импортированный из
 * `@deepseek-ai/dsh-session/types`: этот пакет не входит в зависимости плагина и из него не
 * резолвится (@deepseek-ai/dsh-api-session-controller тянет его как свой внутренний тип), а
 * `SessionId` наружу из `/client` не реэкспортирован. Вывод из `create()` даёт ровно тот же
 * брендированный тип и не заводит зависимость, которой нет.
 */
type SessionId = Awaited<ReturnType<ISessions['create']>>
// Type-only: даёт декларацию `ctx.workspaces` в `Context` + IWorkspaces/WorkspaceId — те же типы,
// которыми сам харнесс определяет цель в startSession (navigation.ts:114-127).
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: даёт декларацию `ctx.uiWorkspace` в `Context` — connectWorkspace(), единственный
// вызов службы, который отдаёт SessionId (startSession этого не делает).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: даёт декларацию `ctx.conversation` в `Context` (SessionInputResolver.for(actx).setDraft).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Иконка кнопки сайдбара: реальный набор харнесса, не hand-drawn SVG (Task 4 визуального
// выравнивания) — пакет внешний (см. CLIENT_EXTERNALS в tsdown.config.ts), берётся у хоста
// в рантайме, его CSS хост уже гарантированно загрузил (Button/иконки используются по всему
// харнессу).
import { IconChecklistOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { defineStore, type PropsStore, type StoreHandle } from '@deepseek-ai/dsh-client-store'
import type { RpcResult } from '../channel.js'
import { ru, type BftLocaleKey } from './locales.js'
import { RequirementsPanel, type RequirementsPanelInjected } from './Panel.js'
import { panelClassNames as css, panelStyleText } from './Panel.styles.js'
import { forgetRequirementSession, readRequirementSession, writeRequirementSession } from './session-map.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'bft.requirements': BftLocaleKey }
}

const NS = 'bft.requirements'

/**
 * Имя канала RPC-узла (`src/channel.ts`, `BFT_CHANNEL`). Продублировано строкой, а не
 * импортировано как значение: `channel.ts` — общий модуль с node-половиной (там же живёт
 * `dispatch()`, маршрутизирующий ошибки backlog-CLI), и его код клиенту не нужен. Импорт
 * значения затащил бы этот код в браузерный бандл; значение стабильно и проверено
 * `channel.test.ts`, дрейф от дублирования маловероятен.
 */
const CHANNEL = '/bft'

/**
 * Черновик команды синка, который кнопка «Обновить» подставляет в чат (docs/client-wiring.md,
 * «Выводы для реализации», п.1). Ровно текст — без автоотправки: Enter жмёт PO, submit()/
 * conversation.send() эта кнопка не зовёт ни при каких условиях.
 */
const SYNC_COMMAND = '/bft-needed-list'

export interface PanelState {
  open: boolean
}

/**
 * Стор слота: делится между записью кнопки и записью панели (общий `store:`, не два стейта).
 * Тип экспортирован (не сам хэндл — см. комментарий у создания `panelStore` в apply()), чтобы
 * Panel.tsx могло типизировать свои `useStore`/`actions`-пропсы через PropsStore<PanelStoreHandle>.
 */
export type PanelStoreHandle = StoreHandle<PanelState, {
  toggle: (draft: PanelState) => void
  close: (draft: PanelState) => void
}>

/** Слоты дают место регистрации, стор — общее состояние видимости, локаль — копию. */
export const inject = ['slots', 'connection', 'locale']

export function apply(ctx: ClientContext): void {
  // ctx.locale.register(ns, dicts) типизирован как Record<BuiltInLocaleId, ...>,
  // а BuiltInLocaleId в этом харнессе жёстко 'zh' | 'en'
  // (harness-ui/packages/client/locale/src/locale-settings.ts:15) — третий
  // язык через эту перегрузку не завести, лишний ключ 'ru' не пройдёт
  // проверку типов. Отдельная нетипизированная перегрузка register(ns, locale, dict)
  // умеет добавлять произвольный locale-id, но словарь для него читается,
  // только если этот id заранее объявлен выбираемым языком через
  // ctx.locale.addLanguage({id, label, fallback}) — а это меняет каталог
  // языков всего харнесса для всех разделов, а не только нашего. Такое
  // решение — отдельный вопрос продукта, не часть этой задачи.
  // Рабочий язык этого деплоя — русский, поэтому оба обязательных слота
  // получают словарь `ru`: кнопка остаётся русской независимо от того, какой
  // из двух встроенных языков сейчас активен. `en` в locales.ts остаётся
  // источником истины для набора ключей и заготовкой на случай, если позже
  // потребуется настоящий английский или ctx.locale.addLanguage('ru', …).
  ctx.effect(() => ctx.locale.register(NS, { zh: ru, en: ru }), 'dsh-plugin-bft: словарь копии (ru)')

  // НАХОДКА (см. отчёт задачи и комментарий в начале Panel.styles.ts): сборка этого стороннего
  // плагина не тянет `*.module.css` — рецепт харнесса с CSS-пайплайном на lightningcss живёт
  // только внутри монорепозитория (harness-ui/packages/client/tsdown.client.ts), а официальный
  // `@tsdown/css` устраняет ошибку сборки, но выносит CSS в отдельный lib/style.css, который
  // package.json#exports['./client'] этого пакета не публикует и никто не подключает — вёрстка
  // тихо ломается без единой ошибки сборки. Ближайший вариант, которым сам харнесс уже
  // пользуется вне монорепозитория, — dsh-plugin-subscriptions/src/client/index.ts:74-80: текст
  // CSS как строка, вставленная одним <style> через document.createElement внутри ctx.effect().
  // Тот же приём здесь, просто на целую панель, а не на одно точечное переопределение.
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-plugin-bft')
    style.textContent = panelStyleText
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'dsh-plugin-bft: стили панели')

  // Хэндл стора создаётся заново при каждом apply() (перезагрузка плагина) и не экспортируется
  // с модуля — идентичность модульного кэша иначе стала бы замаскированным синглтоном между
  // перезагрузками (см. предупреждение в контракте @deepseek-ai/dsh-client-store). Обе
  // регистрации ниже получают одну и ту же ссылку, поэтому движок отдаёт им один инстанс.
  const panelStore: PanelStoreHandle = defineStore({
    init: (): PanelState => ({ open: false }),
    actions: {
      toggle: (draft) => { draft.open = !draft.open },
      close: (draft) => { draft.open = false },
    },
  })

  // Шелл типизирует `connection` как хостовую грань; в браузерном шелле тот же ключ хранит
  // полный клиентский handle (см. dsh-plugin-subscriptions/src/client/index.ts:81-83 — тот же
  // приём). Здесь берём только то, что реально нужно — .rpc.call — не заводя типовой
  // зависимости от @deepseek-ai/dsh-api-remotes, которого нет среди devDependencies пакета.
  const connection = ctx.get('connection') as unknown as {
    rpc: {
      call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>
    }
  }
  const listRequirements = (signal: AbortSignal): Promise<RpcResult<unknown>> =>
    connection.rpc.call(CHANNEL, 'list', {}, signal)
  const getTask = (id: string, signal: AbortSignal): Promise<RpcResult<unknown>> =>
    connection.rpc.call(CHANNEL, 'task', { id }, signal)
  // Детальная страница (Task 3, DetailPage.tsx): документ требования, путь — из links.html.
  const getDocument = (path: string, signal: AbortSignal): Promise<RpcResult<unknown>> =>
    connection.rpc.call(CHANNEL, 'document', { path }, signal)
  // Поиск документа по конвенции каталогов: клиент передаёт только идентификатор задачи и
  // ничего не знает ни про пути, ни про формат ссылок. Поэтому изменения в навыках bft-*
  // (префиксы, переименования каталогов, незарегистрированный HTML) его не касаются.
  const findDocument = (id: string, signal: AbortSignal): Promise<RpcResult<unknown>> =>
    connection.rpc.call(CHANNEL, 'findDocument', { id }, signal)

  // Цепочка «Обновить»/«Работать в чате» (docs/client-wiring.md, §1.3 и «Выводы для
  // реализации», п.1): uiWorkspace.connectWorkspace → sessions.scope →
  // conversation.input.for(actx).setDraft → sessions.open. Черновик кладём до открытия —
  // оболочка ввода создаётся по запросу и владеет своим редактором (hub.ts:139-145), поэтому
  // сессию не нужно заранее открывать и отрисовывать. Отправки нет ни при каких условиях:
  // submit()/conversation.send() здесь не зовутся, Enter жмёт PO. Обобщена до
  // `openChatWithDraft(draft)`: кнопка «Обновить» зовёт её с `SYNC_COMMAND`, превью
  // (Preview.tsx) — со своим текстом продолжения работы над конкретным БФТ. Сама цепочка не
  // меняется — меняется только то, какой текст подставляется в редактор.
  //
  // Все четыре службы читаются лениво через ctx.get() ПРЯМО В МОМЕНТ НАЖАТИЯ, а не сохраняются
  // в переменную здесь и не идут в export const inject: `inject` — жёсткое требование (падает
  // весь клиентский boot, если служба не активна — harness-ui/packages/client/web/src/boot.ts:
  // 137-157), а этот раздел без sessions/uiWorkspace/conversation/workspaces всё ещё
  // осмыслен (список требований по-прежнему работает) — отсутствие любой из них должно
  // деградировать саму кнопку, а не весь boot (см. приём dsh-plugin-subscriptions/src/client/
  // index.ts:121-122 для `modelDirectories`).
  const openChatWithDraft = async (draft: string): Promise<void> => {
    const uiWorkspace = ctx.get('uiWorkspace')
    const sessions = ctx.get('sessions')
    const workspaces = ctx.get('workspaces')
    const conversation = ctx.get('conversation')
    if (uiWorkspace === undefined || sessions === undefined || workspaces === undefined || conversation === undefined) {
      throw new Error(
        'dsh-plugin-bft: chat unavailable — sessions/uiWorkspace/workspaces/conversation not provided',
      )
    }
    const workspaceId = resolveWorkspaceId(sessions, workspaces)
    if (workspaceId === undefined) {
      throw new Error('dsh-plugin-bft: chat: no workspace to connect to')
    }
    // Только connectWorkspace возвращает SessionId — startSession() не годится, он ничего
    // не отдаёт (docs/client-wiring.md, §1.3, п.1).
    const sessionId = await uiWorkspace.connectWorkspace(workspaceId)
    const actx = sessions.scope(sessionId)
    // sessions.scope(id) отдаёт undefined для сессии, которой нет ни в списке, ни в скопах
    // (contract/sessions.ts:103) — ветку обрабатываем, не проваливаемся в input.for() с ней.
    if (actx === undefined) {
      throw new Error(`dsh-plugin-bft: chat: sessions.scope(${sessionId}) returned no scope`)
    }
    conversation.input.for(actx).setDraft(draft)
    sessions.open(sessionId)
  }

  /** Кнопка «Обновить»: та же цепочка, зафиксированный черновик синка. */
  const openSyncChat = (): Promise<void> => openChatWithDraft(SYNC_COMMAND)

  // ——— Мини-чат детальной страницы (MiniChat.tsx) ———
  //
  // Рабочее пространство по умолчанию для чатов по требованиям: канал отдаёт абсолютный путь
  // каталога из настройки `sessionPath` (по умолчанию — внутренняя папка `bft`), а
  // workspaces.create() по этому пути идемпотентно: хост сперва ищет уже
  // зарегистрированное рабочее пространство (workspace-controller/src/commands.ts,
  // `resolveByPath` → `created: false`) и заводит новое, только если его действительно нет.
  // Поэтому повторные вызовы не плодят дубликатов, а результат можно спокойно кэшировать.

  /**
   * Идентификатор рабочего пространства БФТ, найденный один раз за загрузку страницы.
   * `null` в кэше — «спрашивали, ответа нет» (привязка выключена или каталог не удалось
   * зарегистрировать): повторно дёргать канал на каждое сообщение незачем.
   */
  let bftWorkspace: WorkspaceId | null | undefined
  const resolveBftWorkspaceId = async (workspaces: IWorkspaces): Promise<WorkspaceId | undefined> => {
    if (bftWorkspace !== undefined) return bftWorkspace ?? undefined
    try {
      const result = await connection.rpc.call(CHANNEL, 'sessionWorkspace', {})
      // Привязка выключена пустым sessionPath — это осознанная настройка, а не сбой.
      if (!result.ok || typeof result.value !== 'string') {
        bftWorkspace = null
        return undefined
      }
      const workspace = await workspaces.create({ path: result.value })
      bftWorkspace = workspace.workspaceId
      return workspace.workspaceId
    } catch (error: unknown) {
      // Каталога нет, путь не годится в рабочее пространство, канал недоступен — мини-чат
      // от этого не должен ломаться: вызывающая сторона откатится к текущему рабочему
      // пространству. Причину печатаем, чтобы молчаливой деградации не было.
      console.error('[dsh-plugin-bft] рабочее пространство БФТ недоступно, беру текущее:', error)
      bftWorkspace = null
      return undefined
    }
  }

  //
  // Принципиальное отличие от openChatWithDraft выше: эта цепочка НИКОГДА не зовёт
  // sessions.open() и не пишет черновик в композер основного окна. Она отправляет запрос
  // прямо в сессию требования через session.prompt() — публичный метод ISession, которому
  // навигация не нужна. Именно это и было сломано с точки зрения PO: правка в мини-чате
  // уводила основной интерфейс в полноценный диалог, вместо того чтобы остаться на странице.
  //
  // sessions.binding(id) — «pure resolution — no staging, no window side effects»
  // (session-controller/src/client/sessions/service.ts), то есть само получение сессии
  // основное окно никуда не перетаскивает.

  /**
   * Сессия мини-чата для требования: закреплённая за ним (session-map.ts) либо новая.
   * Закреплённая проверяется по актуальному списку хоста — запись в localStorage могла
   * протухнуть (сессию удалили, база переехала). Протухла — забываем и заводим новую,
   * это штатный путь, а не ошибка.
   */
  const resolveRequirementSession = async (taskId: string): Promise<{
    sessions: ISessions
    sessionId: SessionId
  }> => {
    const sessions = ctx.get('sessions')
    const workspaces = ctx.get('workspaces')
    if (sessions === undefined || workspaces === undefined) {
      throw new Error('dsh-plugin-bft: mini-chat unavailable — sessions/workspaces not provided')
    }
    const remembered = readRequirementSession(taskId) as SessionId | undefined
    if (remembered !== undefined) {
      if (sessions.list.getSnapshot().byId[remembered] !== undefined) {
        return { sessions, sessionId: remembered }
      }
      forgetRequirementSession(taskId)
    }
    // Рабочее пространство по умолчанию (настройка `sessionPath`, по умолчанию внутренняя
    // папка `bft`) — предпочтительная цель: агент оказывается прямо там, где лежат документы
    // требований, а чаты по БФТ собираются в отдельную группу и не смешиваются с общими.
    // Не получилось (привязка выключена, каталога нет, служба недоступна) — откатываемся к
    // текущему рабочему пространству харнесса, как было до этой настройки: мини-чат должен
    // деградировать, а не переставать работать из-за конфигурации.
    const workspaceId = await resolveBftWorkspaceId(workspaces)
      ?? resolveWorkspaceId(sessions, workspaces)
    if (workspaceId === undefined) throw new Error('dsh-plugin-bft: mini-chat: no workspace to create a session in')
    const created = await sessions.create({ workspaceId })
    writeRequirementSession(taskId, created)
    return { sessions, sessionId: created }
  }

  /**
   * Отправить инструкцию в сессию требования, не трогая основной интерфейс.
   * Режим 'queue': если агент сейчас занят, правка встанет в очередь и выполнится следом,
   * а не оборвёт текущий ход (для коротких уточнений по документу это то поведение, которое
   * не теряет работу).
   */
  const sendToRequirement = async (taskId: string, text: string): Promise<void> => {
    const { sessions, sessionId } = await resolveRequirementSession(taskId)
    const binding = sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`dsh-plugin-bft: mini-chat: no binding for session ${String(sessionId)}`)
    const result = await binding.session.prompt([{ type: 'text', text }], 'queue')
    if (!result.ok) throw new Error(`dsh-plugin-bft: mini-chat: ${result.error.code}: ${result.error.message}`)
  }

  /**
   * Наблюдение за тем, работает ли агент над требованием. Флаг `running` хост проталкивает
   * в каждую созданную сессию из авторитетного списка независимо от того, открыта ли она
   * (session-controller/src/client/sessions/manager.ts) — поэтому статус живой без навигации.
   * Возвращает функцию отписки; сессии ещё может не быть — тогда это просто `false`.
   */
  const watchRequirementRunning = (taskId: string, onChange: (running: boolean) => void): (() => void) => {
    const sessions = ctx.get('sessions')
    if (sessions === undefined) return () => {}
    const read = (): boolean => {
      const sessionId = readRequirementSession(taskId) as SessionId | undefined
      if (sessionId === undefined) return false
      return sessions.list.getSnapshot().byId[sessionId]?.running ?? false
    }
    onChange(read())
    return sessions.list.subscribe(() => { onChange(read()) })
  }

  /**
   * Явный, а не автоматический переход в основное окно: мини-чат намеренно не показывает
   * ответы агента (см. комментарий в MiniChat.tsx), и это единственный способ их прочитать.
   * Тот же уход, что раньше происходил сам собой — теперь только по осознанному нажатию.
   */
  const openRequirementInMainChat = async (taskId: string): Promise<void> => {
    const { sessions, sessionId } = await resolveRequirementSession(taskId)
    sessions.open(sessionId)
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'bft-requirements', locale: NS, store: panelStore },
    RequirementsButton,
  ))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'bft-requirements',
      locale: NS,
      store: panelStore,
      inject: (): RequirementsPanelInjected => ({
        listRequirements,
        getTask,
        getDocument,
        findDocument,
        openSyncChat,
        openChatWithDraft,
        sendToRequirement,
        watchRequirementRunning,
        openRequirementInMainChat,
      }),
    },
    RequirementsPanel,
  ))
}

/**
 * Рабочее пространство для «Обновить» — тем же выводом, каким сам харнесс определяет цель в
 * startSession (harness-ui/packages/client/ui-workspace/src/client/navigation.ts:114-127,
 * см. docs/client-wiring.md §1.4): рабочее пространство текущей сессии, а если такой нет —
 * самое недавно активное (по последней активности сессий, иначе по дате создания). Ни одного
 * рабочего пространства вообще — undefined; openChatWithDraft тогда останавливается, не пытаясь
 * подключиться вслепую. `sessions.clear()`, которым в этом случае заканчивается сам
 * startSession, здесь не к месту — это навигационное поведение чужого сценария («открыть
 * пустой экран нового чата»), а не часть синхронизации требований.
 */
function resolveWorkspaceId(sessions: ISessions, workspaces: IWorkspaces): WorkspaceId | undefined {
  const sessionList = sessions.list.getSnapshot()
  const workspaceList = workspaces.list.getSnapshot()
  const current = sessionList.current
  const currentWorkspaceId = current === undefined
    ? undefined
    : workspaceList.items.find(item => item.sessionIds.includes(current))?.workspaceId
  if (currentWorkspaceId !== undefined) return currentWorkspaceId

  let recent: WorkspaceId | undefined
  let recentTime = Number.NEGATIVE_INFINITY
  for (const item of workspaceList.items) {
    let latest = Number.NEGATIVE_INFINITY
    for (const sessionId of item.sessionIds) {
      const session = sessionList.byId[sessionId]
      if (session !== undefined) latest = Math.max(latest, session.updatedAt)
    }
    if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(item.createdAt)
    if (recent === undefined || latest > recentTime) {
      recent = item.workspaceId
      recentTime = latest
    }
  }
  return recent
}

/**
 * Кнопка раздела в подвале левой панели: переключает общий с панелью стор видимости.
 *
 * Разметка и классы — дословный образец того же слота (`sidebar.footer.action`) у соседнего
 * плагина харнесса ui-cordis: harness-ui/packages/extensions/ui-cordis/src/client/CordisPanel.tsx
 * (~469-484) + CordisPanel.module.css (~3-80, классы .layer/.footerButtons/.badge/.badgeLabel/
 * .layer.rail/.rail .badge/.rail .footerButtons, здесь — bft-nav-*, см. Panel.styles.ts). `wide` —
 * часть SidebarFooterActionOwnerProps (owner-доля PropsRuntime<'sidebar.footer.action'>,
 * harness-ui/packages/client/ui-sidebar/src/client/contract/slots.ts) — раньше принималась, но
 * не использовалась; теперь переключает раскладку между широкой строкой (иконка + подпись) и
 * узкой колонкой-рельсом (только круглая иконка 36×36), как у эталона. Счётчика («сколько
 * запущено») у эталона (`badgeCount`) для «Требований» нет осмысленного аналога — не заводим.
 * `data-active` — тот же смысл, что уже был у `aria-pressed` (кнопка-переключатель панели),
 * `aria-pressed` остаётся для доступности отдельно от CSS-хука.
 */
function RequirementsButton({ t, useStore, actions, wide }: PropsStore<PanelStoreHandle> & {
  t: (key: BftLocaleKey) => string
  wide: boolean
}) {
  const open = useStore(state => state.open)
  return (
    <div className={wide ? css.navLayer : `${css.navLayer} ${css.navRail}`}>
      <div className={css.navFooterButtons}>
        <button
          type="button"
          className={css.navBadge}
          data-active={open || undefined}
          aria-pressed={open}
          aria-label={t('nav')}
          onClick={() => { actions.toggle() }}
        >
          <IconChecklistOutline14 size={wide ? 16 : 18} />
          {wide && <span className={css.navBadgeLabel}>{t('nav')}</span>}
        </button>
      </div>
    </div>
  )
}
