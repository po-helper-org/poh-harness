/**
 * Мобильный скин poh-harness — браузерная половина.
 *
 * Архитектурное правило (выстрадано на iOS/WebKit): НИКАКИХ переносов
 * React-управляемых DOM-нод. Перенос toggle сайдбара в body ронял React
 * при первом же ре-рендере (NotFoundError: node to remove is not a child)
 * — дерево размонтировалось, экран становился чёрным, выживал только
 * перенесённый бургер. Вместо этого:
 *  - свой бургер: <button> созданный нами и добавленный в body (React его
 *    не ведает — безопасно);
 *  - штатный toggle сайдбара на мобильном прячется CSS-ом, но бургер жмёт
 *    его программно: так dsh сам разворачивает сайдбар в полный вид (чаты,
 *    подписи разделов), а не показывает свёрнутую рейку иконок;
 *  - состояние drawer читается с фрейма (data-sidebar-collapsed) и
 *    зеркалится data-атрибутом на колонку сайдбара + на body (для scrim
 *    без :has(), его старые WebKit не любят).
 *
 * Классы харнесса 0.1.7-rc.2 (хэши меняются с мажорами ядра):
 *  - .pI_x6G_frame/.pI_x6G_sidebarCol/.pI_x6G_centerCol — ui-layout
 *  - .hHd-Xa_root/.hHd-Xa_toggle/.hHd-Xa_footArea/.hHd-Xa_footerActions/
 *    .hHd-Xa_regionArea/.hHd-Xa_settingsArea — ui-sidebar
 *  - .wSkVaW_body[data-content-phase] / .wSkVaW_composerHero / .pXSMma_root
 *    — ui-conversation: тело чата, стартовый экран (hero), шапка hero
 *
 * Стартовый экран «как у Claude Mobile»: приветствие по центру, поле ввода
 * прижато к низу и стоит над клавиатурой, фокус в поле сразу. Высоту берём
 * из visualViewport (iOS не сжимает layout viewport под клавиатуру).
 * iOS Safari не открывает клавиатуру на программный focus() без жеста —
 * поэтому там первый тап по пустому экрану ставит фокус в поле.
 *
 * PWA: meta-теги standalone-режима iOS/Android, запрет масштабирования
 * (iOS зумит страницу при фокусе в поле со шрифтом < 16px) и фиксация
 * документа — никаких горизонтальных «елозаний».
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'

const SELECTORS = {
  frame: '.pI_x6G_frame',
  sidebarCol: '.pI_x6G_sidebarCol',
  nativeToggle: '.pI_x6G_sidebarCol .hHd-Xa_toggle',
  heroBody: "[data-content-phase='hero']",
  editor: "[data-composer-input][contenteditable='true']",
  centerCol: '.pI_x6G_centerCol',
  settingsPanel: '.VOzbGW_panel',
  settingsNavCell: '.VOzbGW_navCell',
  settingsNavLabel: '.VOzbGW_navLabel',
} as const

const BURGER_ATTR = 'data-poh-mobile-burger'
const BURGER_ATTR_SELECTOR = '[data-poh-mobile-burger]'
/** Настройки на мобильном: 'list' (разделы) | 'detail' (раздел на весь экран). */
const SETTINGS_ATTR = 'data-poh-settings'
const SETTINGS_BAR_SELECTOR = '[data-poh-settings-bar]'

/** Пункты drawer, тап по которым выполняет действие и закрывает меню. */
const ITEM_SELECTOR = 'button, a[href], [role=button], [role=link], [role=treeitem], [role=menuitem]'
/**
 * Исключения: раскрывают что-то внутри drawer, меню должно остаться.
 * .bhn1Oq_sectionHeader — шапка «Workspaces» (поиск, фильтр, новая папка),
 * ui-workspace 0.1.7-rc.2.
 */
const KEEP_OPEN_SELECTOR =
  '[aria-expanded], [aria-haspopup], input, textarea, select, [contenteditable=true], .bhn1Oq_sectionHeader'
const DRAWER_ATTR = 'data-poh-drawer'
const MOBILE_QUERY = '(max-width: 768px)'

const VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, ' +
  'viewport-fit=cover, interactive-widget=resizes-content'

/** PWA-meta: добавляем только отсутствующие, при dispose убираем свои. */
const PWA_META: ReadonlyArray<[string, string]> = [
  ['apple-mobile-web-app-capable', 'yes'],
  ['mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
  ['apple-mobile-web-app-title', 'Harness'],
  ['theme-color', '#141416'],
]

/** Гамбургер-иконка: три полоски, цвет наследуется. */
const BURGER_SVG =
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'poh-mobile-skin')
    style.textContent = MOBILE_CSS
    document.head.appendChild(style)

    const mq = window.matchMedia(MOBILE_QUERY)
    const isMobile = () => mq.matches

    // ── Viewport + PWA meta ───────────────────────────────────────────
    let viewportMeta = document.querySelector<HTMLMetaElement>('meta[name=viewport]')
    const prevViewport = viewportMeta?.getAttribute('content') ?? null
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta')
      viewportMeta.name = 'viewport'
      document.head.appendChild(viewportMeta)
    }
    viewportMeta.setAttribute('content', VIEWPORT_CONTENT)
    const addedMeta: HTMLMetaElement[] = []
    for (const [name, content] of PWA_META) {
      if (document.querySelector(`meta[name="${name}"]`)) continue
      const m = document.createElement('meta')
      m.name = name
      m.content = content
      document.head.appendChild(m)
      addedMeta.push(m)
    }

    // ── Состояние drawer = развёрнут ли сайдбар у самого dsh ──────────
    const isExpanded = () => {
      const frame = document.querySelector(SELECTORS.frame)
      return !!frame && !frame.hasAttribute('data-sidebar-collapsed')
    }
    const nativeToggle = () => {
      document.querySelector<HTMLElement>(SELECTORS.nativeToggle)?.click()
    }
    const setOpen = (open: boolean) => {
      if (isMobile() && isExpanded() !== open) nativeToggle()
    }
    // Зеркалим состояние dsh в наши атрибуты (CSS drawer и scrim).
    const reflect = () => {
      const open = isMobile() && isExpanded()
      document.querySelectorAll(SELECTORS.sidebarCol).forEach(el => {
        if (open) el.setAttribute('data-open', 'true')
        else el.removeAttribute('data-open')
      })
      if (open) document.body.setAttribute(DRAWER_ATTR, 'open')
      else document.body.removeAttribute(DRAWER_ATTR)
    }

    // ── Собственный бургер (вне React-дерева) ─────────────────────────
    const burger = document.createElement('button')
    burger.type = 'button'
    burger.setAttribute(BURGER_ATTR, 'true')
    burger.setAttribute('aria-label', 'Меню')
    burger.innerHTML = BURGER_SVG
    const onBurgerClick = (e: Event) => {
      if (!isMobile()) return
      e.preventDefault()
      e.stopPropagation()
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      setOpen(!isExpanded())
    }
    burger.addEventListener('click', onBurgerClick, true)
    document.body.appendChild(burger)

    // Тап по scrim (центр при открытом drawer) — закрыть, не пропуская тап
    // в чат под ним. Тап по пункту drawer (плагин, чат, новая сессия,
    // настройки) — выполнить и закрыть. Не закрываем на том, что раскрывает
    // что-то внутри drawer: группы/«ещё» (aria-expanded), кнопки меню
    // (aria-haspopup), шапка списка (поиск/фильтр/новая папка), поля ввода.
    // Всплывающие меню dsh живут в порталах вне сайдбара и центра — их
    // тапы не трогаем вовсе.
    let closeTimer = 0
    const onDocClick = (e: MouseEvent) => {
      if (!isMobile() || !isExpanded()) return
      const target = e.target as HTMLElement | null
      if (!target || target.closest(BURGER_ATTR_SELECTOR)) return
      if (!target.closest(SELECTORS.sidebarCol)) {
        if (target.closest(SELECTORS.centerCol)) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
        }
        return
      }
      const item = target.closest<HTMLElement>(ITEM_SELECTOR)
      if (!item || item.closest(KEEP_OPEN_SELECTOR)) return
      // даём dsh отработать клик (открыть чат/панель), затем закрываем
      window.clearTimeout(closeTimer)
      closeTimer = window.setTimeout(() => setOpen(false), 0)
    }
    document.addEventListener('click', onDocClick, true)

    // Ресайз в десктоп — прибрать наши атрибуты.
    const onMqChange = () => { reflect(); syncSettings() }
    mq.addEventListener('change', onMqChange)

    // ── Клавиатура: высота видимой области → --poh-vvh ────────────────
    // iOS при открытой клавиатуре оставляет layout viewport прежним и
    // скроллит страницу; фиксируем фрейм по видимой области, чтобы поле
    // ввода стояло прямо над клавиатурой, а не уезжало под неё.
    const vv = window.visualViewport
    const root = document.documentElement
    const syncViewport = () => {
      if (!vv) return
      root.style.setProperty('--poh-vvh', `${Math.round(vv.height)}px`)
      root.style.setProperty('--poh-vvtop', `${Math.round(vv.offsetTop)}px`)
      // Документ не должен скроллиться: iOS иногда сдвигает его при фокусе.
      if (isMobile() && (window.scrollX !== 0 || window.scrollY !== 0)) window.scrollTo(0, 0)
    }
    syncViewport()
    vv?.addEventListener('resize', syncViewport)
    vv?.addEventListener('scroll', syncViewport)

    // ── Фокус в поле ввода на стартовом экране ────────────────────────
    // Ставим один раз на каждое появление hero (новая сессия / старт).
    const heroEditor = () =>
      document.querySelector<HTMLElement>(`${SELECTORS.heroBody} ${SELECTORS.editor}`)
    let focusedHero: HTMLElement | null = null
    const tryFocusHero = () => {
      if (!isMobile() || isExpanded()) return
      const editor = heroEditor()
      if (!editor) { focusedHero = null; return }
      if (editor === focusedHero) return
      focusedHero = editor
      if (document.activeElement !== editor) editor.focus({ preventScroll: true })
    }

    // ── Настройки: список разделов → раздел на весь экран ─────────────
    // Модалка dsh двухпанельная (разделы слева, содержимое справа). На
    // телефоне показываем по одной панели, как в iOS: состояние — атрибут
    // на body, «Назад» и заголовок — наша плашка вне React-дерева.
    const settingsBar = document.createElement('div')
    settingsBar.setAttribute('data-poh-settings-bar', 'true')
    const backBtn = document.createElement('button')
    backBtn.type = 'button'
    backBtn.setAttribute('aria-label', 'Назад')
    backBtn.innerHTML =
      '<svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">' +
      '<path d="M10 2 2 10l8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span>Назад</span>'
    const barTitle = document.createElement('div')
    barTitle.setAttribute('data-poh-settings-title', 'true')
    settingsBar.append(backBtn, barTitle)
    document.body.appendChild(settingsBar)

    let settingsPanel: Element | null = null
    const setSettingsView = (view: 'list' | 'detail' | null) => {
      if (view) document.body.setAttribute(SETTINGS_ATTR, view)
      else document.body.removeAttribute(SETTINGS_ATTR)
    }
    const syncSettings = () => {
      const panel = isMobile() ? document.querySelector(SELECTORS.settingsPanel) : null
      const wasOpen = settingsPanel !== null
      settingsPanel = panel
      // Со списка — только на переходе «закрыто → открыто»: если dsh
      // пересоздаст узел панели при смене раздела, вид не сбрасывается.
      if (panel && !wasOpen) setSettingsView('list')
      else if (!panel && wasOpen) setSettingsView(null)
    }
    const onSettingsClick = (e: Event) => {
      if (!isMobile() || !settingsPanel) return
      const cell = (e.target as HTMLElement | null)?.closest(SELECTORS.settingsNavCell)
      if (!cell || !settingsPanel.contains(cell)) return
      barTitle.textContent =
        cell.querySelector(SELECTORS.settingsNavLabel)?.textContent ?? cell.textContent ?? ''
      setSettingsView('detail')
    }
    document.addEventListener('click', onSettingsClick, true)
    const onBack = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      setSettingsView('list')
    }
    backBtn.addEventListener('click', onBack)

    let raf = 0
    const observer = new MutationObserver(() => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; reflect(); syncSettings(); tryFocusHero() })
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-content-phase', 'contenteditable', 'data-sidebar-collapsed'],
    })
    reflect()
    syncSettings()
    tryFocusHero()

    // iOS: focus() без жеста клавиатуру не поднимает — тап по пустому
    // месту стартового экрана (не по кнопкам/полю) переводит фокус в поле.
    const onHeroTap = (e: Event) => {
      if (!isMobile() || isExpanded()) return
      const target = e.target as HTMLElement | null
      if (!target || !target.closest(SELECTORS.heroBody)) return
      if (target.closest('button, a, input, textarea, select, [role=button], [role=menu], [contenteditable=true]')) return
      const editor = heroEditor()
      if (editor && document.activeElement !== editor) editor.focus({ preventScroll: true })
    }
    document.addEventListener('touchend', onHeroTap, true)

    return () => {
      burger.removeEventListener('click', onBurgerClick, true)
      document.removeEventListener('click', onDocClick, true)
      document.removeEventListener('touchend', onHeroTap, true)
      document.removeEventListener('click', onSettingsClick, true)
      backBtn.removeEventListener('click', onBack)
      settingsBar.remove()
      document.body.removeAttribute(SETTINGS_ATTR)
      mq.removeEventListener('change', onMqChange)
      vv?.removeEventListener('resize', syncViewport)
      vv?.removeEventListener('scroll', syncViewport)
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(closeTimer)
      root.style.removeProperty('--poh-vvh')
      root.style.removeProperty('--poh-vvtop')
      if (prevViewport !== null) viewportMeta?.setAttribute('content', prevViewport)
      else viewportMeta?.remove()
      addedMeta.forEach(m => m.remove())
      document.body.removeAttribute(DRAWER_ATTR)
      document.querySelectorAll(SELECTORS.sidebarCol).forEach(el => el.removeAttribute('data-open'))
      burger.remove()
      style.remove()
    }
  }, 'poh-mobile-skin: мобильный скин')
}

/**
 * Стратегия «как у Claude» (только CSS + наш бургер, без махинаций с DOM):
 *  0. Документ зафиксирован: без скролла, отскока и зума.
 *  1. Сайдбар — drawer: спрятан за левый край, центр на всю ширину;
 *     внутри — развёрнутый вид dsh, разделы плагинов подняты наверх.
 *  2. Стартовый экран: приветствие по центру, поле ввода внизу.
 *  3. Штатный toggle сайдбара на мобильном скрыт (бургер наш).
 *  4. Scrim через body[data-poh-drawer] без :has() (старые WebKit).
 */
const MOBILE_CSS = `
${BURGER_ATTR_SELECTOR}, ${SETTINGS_BAR_SELECTOR} {
  display: none;
}

@media (max-width: 768px) {

  /* 0. Документ неподвижен: ни горизонтального скролла, ни резинового
        отскока, ни double-tap-зума. Скроллятся только внутренние области. */
  html, body {
    position: fixed !important;
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    overscroll-behavior: none;
    touch-action: manipulation;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }
  /* iOS зумит страницу при фокусе в поле со шрифтом < 16px. */
  input, textarea, select, [contenteditable='true'] {
    font-size: 16px !important;
  }
  [data-conversation-scroll], .hHd-Xa_regionArea {
    overflow-x: hidden !important;
    overscroll-behavior: contain;
  }

  /* 1. Фрейм = видимая область (над клавиатурой) минус вырезы экрана.
        --poh-vvh ставит JS из visualViewport; до него — 100dvh. */
  .pI_x6G_frame {
    position: fixed !important;
    left: 0;
    right: 0;
    top: var(--poh-vvtop, 0px);
    width: 100vw !important;
    max-width: 100vw;
    height: var(--poh-vvh, 100dvh) !important;
    box-sizing: border-box;
    padding-top: env(safe-area-inset-top) !important;
    overflow: hidden !important;
  }

  /* 1a. Центр — вся ширина. Сайдбар fixed выпал из grid-потока, поэтому
         колонки назначаем явно: без этого центр авто-размещался в первую
         (нулевую) колонку — экран был чёрным, виден только бургер. */
  .pI_x6G_frame {
    grid-template-columns: 0 minmax(0, 100%) 0 !important;
  }
  .pI_x6G_centerCol {
    grid-column: 2 !important;
    grid-row: 1 !important;
    padding-left: 0 !important;
    min-width: 0;
  }
  .pI_x6G_rightbarCol {
    grid-column: 3 !important;
    grid-row: 1 !important;
  }
  /* ресайз-ручки на тач-экране не нужны */
  .pI_x6G_handle { display: none !important; }

  /* 1b. Сайдбар-drawer. Длинные свойства вместо inset-шортхэнда:
         старые WebKit плохо парсят inset с auto. */
  .pI_x6G_sidebarCol {
    position: fixed !important;
    top: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    z-index: 60;
    width: min(84vw, 340px) !important;
    max-width: min(84vw, 340px);
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    box-sizing: border-box;
    background: var(--dsw-specific-sidebar-fill, #1b1b1d) !important;
    transform: translateX(-105%);
    transition: transform 0.25s ease;
    box-shadow: 0 8px 32px rgba(0,0,0,.35);
  }
  .pI_x6G_sidebarCol[data-open='true'] {
    transform: translateX(0);
  }
  .pI_x6G_sidebarCol .hHd-Xa_root {
    width: 100% !important;
  }

  /* 1c. Порядок в drawer: шапка → разделы плагинов → чаты → настройки.
         footArea «растворяем», чтобы его части стали пунктами колонки. */
  .pI_x6G_sidebarCol .hHd-Xa_footArea {
    display: contents !important;
  }
  .pI_x6G_sidebarCol .hHd-Xa_footerActions {
    order: 1;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 2px;
    margin: 0 0 8px;
    padding-bottom: 8px;
    border-bottom: .5px solid var(--dsw-alias-border-l3, rgba(255,255,255,.08));
  }
  .pI_x6G_sidebarCol .hHd-Xa_footerActions > * {
    width: 100% !important;
  }
  .pI_x6G_sidebarCol .hHd-Xa_regionArea {
    order: 2;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .pI_x6G_sidebarCol .hHd-Xa_settingsArea {
    order: 3;
  }

  /* 1d. Панель «Plugins» (ui-plugin-manager, id 'plugins') в мобильном меню
         не нужна. Своего класса у строки нет — узнаём по подписи во всех
         локалях пакета; другие панели (напр. «Automation tasks») остаются.
         Опустевший список панелей прячем целиком, чтобы не оставлять отступ. */
  .hHd-Xa_panelRow[aria-label='Plugins'],
  .hHd-Xa_panelRow[aria-label='插件'] {
    display: none !important;
  }
  .hHd-Xa_panelList:not(:has(.hHd-Xa_panelRow:not([aria-label='Plugins']):not([aria-label='插件']))) {
    display: none !important;
  }

  /* scrim на центре при открытом drawer (управляется с body, без :has()). */
  body[data-poh-drawer='open'] .pI_x6G_centerCol::after {
    content: '';
    position: fixed;
    top: 0; right: 0; bottom: 0; left: 0;
    z-index: 55;
    background: rgba(0,0,0,.45);
  }

  /* 2. Колонка чата — по ширине экрана (десктоп держит минимум 680px). */
  .wSkVaW_body {
    --dsh-chat-content-width: calc(100vw - 32px) !important;
    --dsh-composer-card-max-width: calc(100vw - 16px) !important;
    --dsh-composer-side-clearance: 8px !important;
  }
  /* шапка чата не прячется под бургером */
  .wSkVaW_header {
    padding-left: 60px !important;
    padding-right: 12px !important;
  }
  /* поле ввода не упирается в home indicator */
  .wSkVaW_composerSeat {
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* 2a. Стартовый экран как у Claude: приветствие по центру свободного
         места, поле ввода прижато к низу. */
  [data-content-phase='hero'] .wSkVaW_scrollBody {
    justify-content: flex-end !important;
  }
  [data-content-phase='hero'] .wSkVaW_composerSeat {
    flex: 1 1 auto;
    min-height: 100%;
  }
  [data-content-phase='hero'] .wSkVaW_composerHero {
    flex: 1 1 auto;
    width: 100% !important;
    padding: 0 8px 8px !important;
    box-sizing: border-box;
  }
  [data-content-phase='hero'] .wSkVaW_composerHero > .pXSMma_root {
    flex: 1 1 auto;
    height: auto;
    min-height: 96px;
    padding-top: 56px;
  }
  [data-content-phase='hero'] .pXSMma_headline {
    font-size: 24px;
    line-height: 30px;
  }

  /* 3. Штатный toggle сайдбара на мобильном не нужен — есть бургер
        (он жмёт этот toggle программно, поэтому скрываем, а не удаляем). */
  .pI_x6G_sidebarCol .hHd-Xa_toggle {
    display: none !important;
  }

  /* 4. Наш бургер: fixed в левом верхнем углу, поверх всего. */
  ${BURGER_ATTR_SELECTOR} {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: calc(env(safe-area-inset-top) + 8px);
    left: 10px;
    /* выше drawer/scrim (60/55), но ниже модалок dsh (1000) */
    z-index: 70;
    width: 40px;
    height: 40px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 12px;
    background: var(--dsw-alias-bg-l2, #17171a);
    color: var(--dsw-alias-label-primary, #eee);
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,.3);
    -webkit-tap-highlight-color: transparent;
  }
  /* drawer открыт — бургер не нужен, закрытие тапом по scrim;
     открыты настройки — на его месте «Назад»/крестик */
  body[data-poh-drawer='open'] ${BURGER_ATTR_SELECTOR},
  body[${SETTINGS_ATTR}] ${BURGER_ATTR_SELECTOR} {
    display: none;
  }

  /* 5. Настройки — полноэкранный лист в стиле iOS.
        list:   заголовок + сгруппированный список разделов, крестик слева;
        detail: «‹ Назад» + название раздела, содержимое на весь экран. */
  .VOzbGW_overlay {
    align-items: stretch !important;
    justify-content: stretch !important;
    top: var(--poh-vvtop, 0px) !important;
    bottom: auto !important;
    height: var(--poh-vvh, 100dvh) !important;
  }
  .VOzbGW_mask { display: none; }
  .VOzbGW_panel {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100% !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: var(--dsw-alias-bg-base, #141416) !important;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    box-sizing: border-box;
    position: relative;
  }

  /* list */
  body[${SETTINGS_ATTR}='list'] .VOzbGW_nav {
    width: 100% !important;
    padding: 0 16px 16px !important;
    gap: 20px !important;
    overflow-y: auto;
  }
  body[${SETTINGS_ATTR}='list'] .VOzbGW_navTitle {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 !important;
    font-size: 17px !important;
    font-weight: 600 !important;
  }
  body[${SETTINGS_ATTR}='list'] .VOzbGW_navList {
    gap: 0 !important;
    border-radius: 14px;
    background: var(--dsw-alias-bg-layer-2, #232326);
    overflow: hidden;
  }
  body[${SETTINGS_ATTR}='list'] .VOzbGW_navCell {
    height: 54px !important;
    padding: 0 16px !important;
    gap: 14px !important;
    font-size: 17px !important;
    border-radius: 0 !important;
    background: transparent !important;
    position: relative;
  }
  body[${SETTINGS_ATTR}='list'] .VOzbGW_navCell + .VOzbGW_navCell::before {
    content: '';
    position: absolute;
    top: 0; right: 0; left: 50px;
    border-top: .5px solid var(--dsw-alias-border-l2, rgba(255,255,255,.1));
  }
  body[${SETTINGS_ATTR}='list'] .VOzbGW_navCell::after {
    content: '';
    flex: none;
    width: 8px;
    height: 8px;
    margin-right: 4px;
    border-top: 2px solid var(--dsw-alias-label-tertiary, #777);
    border-right: 2px solid var(--dsw-alias-label-tertiary, #777);
    transform: rotate(45deg);
  }
  body[${SETTINGS_ATTR}='list'] .VOzbGW_navCell:active {
    background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06)) !important;
  }
  /* из содержимого в списке остаётся только крестик — слева, как у Claude */
  body[${SETTINGS_ATTR}='list'] .VOzbGW_content {
    position: absolute !important;
    top: env(safe-area-inset-top);
    left: 8px;
    width: auto !important;
    flex: none !important;
  }
  body[${SETTINGS_ATTR}='list'] .VOzbGW_options { display: none !important; }

  /* крестик — крупная круглая кнопка под палец */
  .VOzbGW_header {
    height: 56px !important;
    padding: 8px !important;
    align-items: center !important;
  }
  .VOzbGW_close {
    width: 40px !important;
    height: 40px !important;
    border-radius: 50% !important;
    background: var(--dsw-alias-bg-layer-2, #232326) !important;
  }

  /* detail */
  body[${SETTINGS_ATTR}='detail'] .VOzbGW_nav { display: none !important; }
  body[${SETTINGS_ATTR}='detail'] .VOzbGW_content { width: 100%; }
  body[${SETTINGS_ATTR}='detail'] .VOzbGW_options {
    padding: 0 16px 24px !important;
    overflow-x: hidden;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  /* строки «подпись — контрол»: переносим контрол, а не давим подпись */
  body[${SETTINGS_ATTR}='detail'] .Pt1bsG_row {
    flex-wrap: wrap;
    gap: 10px 16px !important;
  }
  body[${SETTINGS_ATTR}='detail'] .Pt1bsG_row > :first-child {
    flex: 1 1 150px;
    min-width: 0;
  }
  body[${SETTINGS_ATTR}='detail'] .Pt1bsG_row > :not(:first-child) {
    max-width: 100%;
  }
  body[${SETTINGS_ATTR}='detail'] .Pt1bsG_title { font-size: 16px !important; line-height: 22px !important; }
  body[${SETTINGS_ATTR}='detail'] .Pt1bsG_description { font-size: 13px !important; }
  body[${SETTINGS_ATTR}='detail'] .VOzbGW_options table {
    display: block;
    max-width: 100%;
    overflow-x: auto;
  }

  /* наша плашка «‹ Назад · Раздел» поверх шапки модалки */
  body[${SETTINGS_ATTR}='detail'] ${SETTINGS_BAR_SELECTOR} {
    display: flex;
    align-items: center;
    position: fixed;
    z-index: 1001;
    top: calc(var(--poh-vvtop, 0px) + env(safe-area-inset-top));
    left: 0;
    right: 64px; /* справа — родной крестик */
    height: 56px;
    padding-left: 8px;
    pointer-events: none;
  }
  ${SETTINGS_BAR_SELECTOR} button {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 10px;
    border: none;
    background: none;
    color: var(--dsw-alias-state-business-primary, #6b8cff);
    font: inherit;
    font-size: 17px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  [data-poh-settings-title] {
    position: absolute;
    left: 64px;
    right: 0;
    text-align: center;
    padding-left: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--dsw-alias-label-primary, #eee);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* под плашкой в шапке пусто: actions слота прижаты вправо к крестику */
  body[${SETTINGS_ATTR}='detail'] .VOzbGW_header { justify-content: flex-end !important; }
}
`
