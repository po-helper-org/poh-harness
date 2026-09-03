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
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { defineStore, type PropsStore, type StoreHandle } from '@deepseek-ai/dsh-client-store'
import type { RpcResult } from '../channel.js'
import { ru, type BftLocaleKey } from './locales.js'
import { RequirementsPanel, type RequirementsPanelInjected } from './Panel.js'
import { panelStyleText } from './Panel.styles.js'

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
      inject: (): RequirementsPanelInjected => ({ listRequirements }),
    },
    RequirementsPanel,
  ))
}

/** Кнопка раздела в подвале левой панели: переключает общий с панелью стор видимости. */
function RequirementsButton({ t, useStore, actions }: PropsStore<PanelStoreHandle> & { t: (key: BftLocaleKey) => string }) {
  const open = useStore(state => state.open)
  return (
    <button type="button" aria-pressed={open} onClick={() => { actions.toggle() }}>
      {t('nav')}
    </button>
  )
}
