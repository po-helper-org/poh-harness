/**
 * Раздел «Управление требованиями», браузерная половина — стадия скелета.
 * Регистрирует одну кнопку в подвале левой панели; на этом шаге кнопка ничего
 * не открывает (панель раздела и открытие чата — следующие задачи). Node-половина
 * (RPC-канал `/bft`, `src/plugin.ts`) этим файлом не затрагивается.
 *
 * Файл называется `index.tsx`, а не `index.ts`: он определяет JSX-разметку
 * кнопки на месте, а TypeScript разрешает JSX-грамматику только в `.tsx`.
 */
// Type-only: даёт декларацию `ctx.slots` в `Context` (@deepseek-ai/cordis).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: даёт слияние SlotMap с записью 'sidebar.footer.action'.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: даёт декларацию `ctx.locale` в `Context`.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ru, type BftLocaleKey } from './locales.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'bft.requirements': BftLocaleKey }
}

const NS = 'bft.requirements'

/** Слоты дают место регистрации, локаль — копию. */
export const inject = ['slots', 'locale']

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

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'bft-requirements', locale: NS },
    RequirementsButton,
  ))
}

/**
 * Кнопка раздела в подвале левой панели. На этом шаге она только показывает
 * своё название и ничего не открывает — клик обрабатывать пока не нужно.
 */
function RequirementsButton({ t }: { t: (key: BftLocaleKey) => string }) {
  return <button type="button">{t('nav')}</button>
}
