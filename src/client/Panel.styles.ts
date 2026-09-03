/**
 * Стили панели «Требования» — как обычный текст CSS, инжектируемый одним `<style>` в
 * `document.head` (см. `apply()` в src/client/index.tsx), а не CSS-модуль.
 *
 * НАХОДКА (см. отчёт задачи): сборка стороннего плагина (`tsdown.config.ts` пакета, отдельная
 * от закрытого рецепта харнесса `harness-ui/packages/client/tsdown.client.ts`) не умеет
 * `*.module.css` — попытка импортировать его напрямую падает с
 * `[plugin tsdown:css-guard] ... @tsdown/css is not installed`. Официальный пакет
 * `@tsdown/css` устраняет эту ошибку сборки, но не решает задачу: по умолчанию он выносит
 * CSS в отдельный `lib/style.css`, а `client.js` не получает НИКАКОГО кода инъекции стиля —
 * проверено сборкой и grep'ом по бандлу (ни `createElement('style')`, ни `appendChild`).
 * `package.json#exports['./client']` этого пакета указывает только на `lib/client.js` — файл
 * `style.css` никто не подключает, и это тихо ломает вёрстку в проде без единой ошибки сборки.
 * Ближайший вариант, которым сам харнесс уже пользуется вне монорепозитория, —
 * `dsh-plugin-subscriptions/src/client/index.ts:74-80`: обычный текст CSS в `.ts`, вставленный
 * через `document.createElement('style')` внутри `ctx.effect()`. Тот же приём — здесь, только
 * стилей на целую панель, а не на одно точечное переопределение, поэтому текст CSS и карта
 * классов вынесены в отдельный файл, а не заведены прямо в index.tsx.
 *
 * Раз хеширования имён классов от CSS-модуля больше нет, коллизии с чужими классами предотвращает
 * префикс `bft-` на каждом селекторе (ниже, через один и тот же объект `c`, чтобы разметка и
 * карта имён не могли разойтись). Правила геометрии и токены — из утверждённого прототипа
 * docs/superpowers/prototypes/2026-09-02-bft-requirements-ui.html (секция «Правая панель»):
 * .panel/.ph-row/.list/.grp/.item/.badge/.empty. Состояния загрузки и ошибки прототип не
 * описывает — их геометрия на тех же токенах и тех же контейнерных правилах, что и пустое
 * состояние, чтобы переключение состояний не двигало раскладку.
 *
 * Все цвета — только через var(--dsw-...). Тайминги/шрифт — через var(--ds-...) токены
 * реального харнесса (harness-ui/packages/client/ui-theme/src/styles/base.css): там они
 * называются --ds-transition-duration(-fast|-slow), а не --ds-dur* — прототип для краткости
 * завёл свои алиасы, здесь используются настоящие имена.
 */

/** Плоская карта «семантическое имя → фактический класс». Единственный источник этих строк. */
export const panelClassNames = {
  panel: 'bft-panel',
  header: 'bft-header',
  badge: 'bft-badge',
  iconButton: 'bft-icon-button',
  body: 'bft-body',
  group: 'bft-group',
  groupHeader: 'bft-group-header',
  groupDot: 'bft-group-dot',
  groupLabel: 'bft-group-label',
  chevron: 'bft-chevron',
  groupBody: 'bft-group-body',
  item: 'bft-item',
  itemBody: 'bft-item-body',
  itemId: 'bft-item-id',
  btn: 'bft-btn',
  btnOutline: 'bft-btn-outline',
  stateBlock: 'bft-state-block',
  stateIcon: 'bft-state-icon',
  stateTitle: 'bft-state-title',
  stateHint: 'bft-state-hint',
  stateMessage: 'bft-state-message',
  skeletonGroup: 'bft-skeleton-group',
  skeletonHead: 'bft-skeleton-head',
  skeletonLine: 'bft-skeleton-line',
  skeletonBar: 'bft-skeleton-bar',
} as const

const c = panelClassNames

export const panelStyleText = `
/* Корень записи слота — сама панель, у правого края фрейма (см. docs/client-wiring.md, §3). */
.${c.panel} {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 100vw - 48px);
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--dsw-specific-sidebar-fill);
  border-left: 0.5px solid var(--dsw-alias-border-l3);
  box-shadow: var(--dsw-elevation-prominent);
  pointer-events: auto;
  /* Приподнятая поверхность — скроллбар получает l2-токены (см. SettingsRoot.module.css). */
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}

.${c.header} {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 12px 8px;
}
.${c.header} h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.${c.badge} {
  flex: none;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  display: inline-grid;
  place-items: center;
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-specific-selector);
  font-variant-numeric: tabular-nums;
}

.${c.iconButton} {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: var(--dsw-alias-label-tertiary);
  transition: background-color var(--ds-transition-duration-fast) ease, color var(--ds-transition-duration-fast) ease;
}
@media (hover: hover) and (pointer: fine) {
  .${c.iconButton}:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
}
.${c.iconButton}:active { transform: scale(0.94); }
.${c.iconButton}:disabled { opacity: 0.5; }

/* Тело панели: один и тот же контейнер (флекс-колонка со скроллом) для всех
   четырёх состояний, чтобы переход между ними не менял геометрию панели. */
.${c.body} {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Группы стадий */
.${c.group} { flex: none; border-radius: 14px; background: var(--dsw-alias-bg-base); box-shadow: 0 0 0 0.5px var(--dsw-alias-border-l2); overflow: hidden; }
.${c.groupHeader} {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  transition: background-color var(--ds-transition-duration-fast) ease;
}
@media (hover: hover) and (pointer: fine) { .${c.groupHeader}:hover { background: var(--dsw-alias-interactive-bg-hover); } }
.${c.groupDot} { flex: none; width: 6px; height: 6px; border-radius: 999px; background: var(--tone, var(--dsw-alias-label-caption)); }
.${c.groupLabel} { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${c.chevron} {
  flex: none;
  margin-left: auto;
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  transition: transform var(--ds-transition-duration) var(--ds-ease-in-out);
}
.${c.group}[data-collapsed="true"] .${c.chevron} { transform: rotate(-90deg); }
.${c.group}[data-collapsed="true"] .${c.groupBody} { display: none; }
.${c.groupBody} { border-top: 0.5px solid var(--dsw-alias-border-l1); }

/* Строка требования: цветная полоса стадии слева (::before, тон — через --tone). */
.${c.item} { position: relative; display: flex; align-items: flex-start; gap: 6px; padding: 9px 10px 9px 14px; }
.${c.item} + .${c.item} { border-top: 0.5px solid var(--dsw-alias-border-l1); }
.${c.item}::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--tone); }
.${c.itemBody} { flex: 1; min-width: 0; font-size: 13px; line-height: 19px; overflow-wrap: anywhere; }
.${c.itemId} { display: block; margin-top: 2px; font: 11px/15px var(--ds-font-family-code); color: var(--dsw-alias-label-caption); }

/* Кнопки: геометрия и обводка — как .btn/.btn-outline прототипа. */
.${c.btn} {
  flex: none;
  height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--ds-transition-duration-fast) ease, transform var(--ds-transition-duration-fast) ease;
}
.${c.btn}:active { transform: scale(0.97); }
.${c.btnOutline} { box-shadow: 0 0 0 0.5px var(--dsw-alias-border-l3); }
@media (hover: hover) and (pointer: fine) { .${c.btnOutline}:hover { background: var(--dsw-alias-interactive-bg-hover); } }

/* Пусто / ошибка: общая геометрия центрированного блока в теле панели. */
.${c.stateBlock} { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 46px 24px; text-align: center; }
.${c.stateIcon} { flex: none; width: 52px; height: 52px; border-radius: 999px; display: grid; place-items: center; background: var(--dsw-specific-selector); color: var(--dsw-alias-label-tertiary); }
.${c.stateIcon}[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.${c.stateTitle} { margin: 0; font-size: 15px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.${c.stateHint} { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-caption); max-width: 30ch; }
.${c.stateMessage} { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); max-width: 32ch; overflow-wrap: anywhere; }

/* Загрузка: тот же контейнерный ритм и геометрия .group/.groupHeader/.item, залитые токеном
   вместо текста — раскладка совпадает с «список получен» бит-в-бит, скачка нет. */
.${c.skeletonGroup} { flex: none; border-radius: 14px; background: var(--dsw-alias-bg-base); box-shadow: 0 0 0 0.5px var(--dsw-alias-border-l2); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.${c.skeletonHead} { height: 13px; width: 40%; }
.${c.skeletonLine} { height: 15px; width: 92%; }
.${c.skeletonLine}:last-child { width: 58%; }
.${c.skeletonBar} { border-radius: 6px; background: var(--dsw-specific-selector); animation: bft-panel-skeleton-pulse 1.4s ease-in-out infinite; }
@keyframes bft-panel-skeleton-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .${c.skeletonBar} { animation: none; }
}
`
