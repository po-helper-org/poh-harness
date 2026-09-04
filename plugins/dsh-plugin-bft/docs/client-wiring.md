# Разведка перед клиентской половиной `dsh-plugin-bft`

Задача 4 плана «Сквозной скелет раздела Управление требованиями». Кода не писали, файлы
харнесса не трогали. Все ссылки — на рабочие копии:

- монорепозиторий харнесса: `<воркспейс>/harness-ui/` (ниже — `harness-ui/…`);
- прецедент стороннего плагина: `<воркспейс>/harness-ui-plugins/dsh-plugin-subscriptions/`
  (ниже — `dsh-plugin-subscriptions/…`).

Догадки помечены словом **[догадка]**. Всё остальное — прочитано в коде.

---

## Вопрос 1. Может ли сторонний плагин создать сессию, открыть её и положить черновик

**Короткий ответ: да, напрямую, без обходных путей и без единого value-импорта пакетов
харнесса.** Обходной путь (регистрация внутри диалога) не нужен.

### 1.1. Почему прямой путь работает: службы, а не импорты

Сотрудничество между плагинами в этом харнессе идёт через службы Cordis, а не через
импорты. Это не соглашение, а проверяемое правило сборки: сторож чистоты бандла падает на
любом value-импорте `@deepseek-ai/*`, кроме разрешённых, и прямо говорит, что делать
вместо него:

> `client bundle purity: "<source>" is not in the default client externals or <id>'s
> dsh.client.external, an inline-safe wire layer, or a generated /remote contribution —
> cross-plugin value imports are forbidden; collaborate through cordis services (type-only
> imports are erased and never reach this gate)`
> — `harness-ui/packages/client/tsdown.client.ts:496`

Ключевое: **type-only импорты стираются транспайлером и до сторожа не доходят**. То есть
`import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'` подтягивает
declaration-merge для `ctx.conversation`, ничего не добавляя в бандл. Ровно так и живёт
работающий сторонний плагин — `dsh-plugin-subscriptions/src/client/index.ts:11-21` (шесть
type-only импортов чужих пакетов) и `dsh-plugin-subscriptions/src/client/index.ts:83`
(`ctx.get('connection')`), `:121-122` (`ctx.get('modelDirectories')` — служба вообще
чужого плагина, взятая лениво).

### 1.2. Какие именно службы нужны и чем предоставляются

| служба (`ctx.<key>`) | что даёт | объявлена в | предоставляется пакетом |
|---|---|---|---|
| `sessions` | `create`, `open`, `scope`, `binding`, `list` | `harness-ui/packages/api/session-controller/src/client/index.ts:69-74` | `@deepseek-ai/dsh-api-session-controller` |
| `conversation` | `input: SessionInputResolver`, `send`, `cancel` | `harness-ui/packages/client/ui-conversation/src/client/index.ts:67-74` | `@deepseek-ai/dsh-client-ui-conversation` |
| `uiWorkspace` | `connectWorkspace`, `startSession` | `harness-ui/packages/client/ui-workspace/src/client/navigation.ts:53-57` | `@deepseek-ai/dsh-client-ui-workspace` |
| `workspaces` | `list` — снимок рабочих пространств | `harness-ui/packages/api/workspace-controller/src/client/index.ts:30-35` | `@deepseek-ai/dsh-api-workspace-controller` |
| `slots` | регистрация в слоте | `harness-ui/packages/client/ui-renderer/src/client/index.ts:42-47` | `@deepseek-ai/dsh-client-ui-renderer` |
| `connection` | `rpc` до узловой половины (`/bft`) | `harness-ui/packages/client/connection/src/client/index.ts:290` (`ctx.provide('connection', handle)`) | `@deepseek-ai/dsh-client-connection` |

Все шесть пакетов входят в профиль `web` — они перечислены в бандле веб-приложения:
`harness-ui/packages/bundle/web-app/cordis.patch.yml:91` (session-controller), `:101`
(workspace-controller), `:163` (client-connection), `:184` (ui-layout), `:187`
(ui-renderer), `:208` (ui-conversation), `:242` (ui-workspace).

Точные лица служб:

- `ISessions` — `harness-ui/packages/api/session-controller/src/client/contract/sessions.ts:21-123`:
  `create(opts?)` (`:35-39`, «returns the Session identity after its local binding is
  addressable»), `open(id)` (`:44`), `scope(id): AgentContext | undefined` (`:103`),
  `binding(id)` (`:122`), `list` (`:23`).
- `UiWorkspace` — `harness-ui/packages/client/ui-workspace/src/client/navigation.ts:15-50`:
  `connectWorkspace(workspaceId): Promise<SessionId>` (объявление `:21`, реализация
  `:88-109` — переиспользует пустую сессию рабочего пространства, иначе создаёт),
  `startSession(workspaceId?): void` (объявление `:26`, реализация `:114-127`).
- `IConversation` — `harness-ui/packages/client/ui-conversation/src/client/service.ts:34-65`;
  поле `input: SessionInputResolver` — `:36`. Служба поднимается как корневой синглтон:
  `harness-ui/packages/client/ui-conversation/src/client/apply.ts:366`
  (`ctx.plugin(ConversationController, …)`), имя `'conversation'` — `service.ts:162`.
- `SessionInputResolver.for(actx): SessionInput` —
  `harness-ui/packages/client/ui-conversation/src/client/contract/input.ts:210-213`;
  `SessionInput.setDraft(text)` — `:183`.

### 1.3. Связка целиком

Эталон, на который надо равняться, — перенос черновика между сессиями при смене
рабочего пространства: `harness-ui/packages/client/ui-conversation/src/client/apply.ts:214-232`.
Порядок там такой: сначала получить сессию, потом `setDraft`, и только потом `open`.

Для нашего случая связка из корневого контекста плагина выглядит так (псевдокод, не код
плагина):

```
const sessionId = await ctx.uiWorkspace.connectWorkspace(workspaceId) // Promise<SessionId>
const actx = ctx.sessions.scope(sessionId)                            // AgentContext | undefined
ctx.conversation.input.for(actx).setDraft(text)                       // черновик, НЕ отправка
ctx.sessions.open(sessionId)                                          // навигация на сессию
```

Почему каждый шаг рабочий:

1. `connectWorkspace` возвращает `Promise<SessionId>` и переиспользует уже существующую
   пустую сессию рабочего пространства, если она есть (`navigation.ts:88-109`). Это
   предпочтительнее `startSession`, который возвращает `void` (`navigation.ts:114-127`) —
   идентификатор из него не достать, а он нам нужен для черновика.
   Альтернатива без `uiWorkspace`: `ctx.sessions.create({ workspaceId })`
   (`contract/sessions.ts:35-39`) — но тогда каждый вызов плодит новую сессию.
2. `sessions.scope(id)` отдаёт `AgentContext` для любой сессии, которая есть в списке или
   уже отскоплена (`harness-ui/packages/api/session-controller/src/client/sessions/service.ts:460-462`;
   механика тега — `harness-ui/packages/api/session-controller/src/client/scope.ts:56-69`).
3. `input.for(actx)` читает тег сессии и возвращает резидентную оболочку ввода
   (`harness-ui/packages/client/ui-conversation/src/client/input/hub.ts:67-72`). Если
   оболочки ещё нет, она **создаётся по запросу** из биндинга сессии
   (`hub.ts:139-145`) — то есть сессию не обязательно предварительно открывать и
   отрисовывать.
4. `setDraft` пишет в собственный Lexical-редактор оболочки
   (`harness-ui/packages/client/ui-conversation/src/client/input/facade.ts:269-282`;
   редактор создаётся в конструкторе, `facade.ts:174`, поле `:134`). Редактор существует
   независимо от DOM — черновик можно положить до того, как композер к нему привяжется.
5. Отправки не происходит: отправка — это отдельный `submit()` / `conversation.send()`
   (`contract/input.ts:190-194`, `service.ts:179-183`), их мы не зовём.

### 1.4. Рабочее пространство из корневого контекста

Да, узнать текущее рабочее пространство из корневого клиентского контекста можно — ровно
тем же выводом, каким это делает сам харнесс в `startSession`
(`harness-ui/packages/client/ui-workspace/src/client/navigation.ts:114-121`):

```
sessions.list.getSnapshot().current                        // текущая сессия
workspaces.list.getSnapshot().items
  .find(item => item.sessionIds.includes(current))         // её рабочее пространство
```

С запасным вариантом «самое недавнее рабочее пространство» (`recentWorkspace`,
`navigation.ts:120-123`) и с последним рубежом «ни одного — `sessions.clear()`»
(`navigation.ts:124-128`).

Кроме того, компонент, зарегистрированный в `shell.overlay`, получает стандартные хуки
`useSessions`, `useWorkspaces`, `useSessionPendingInteraction` прямо в пропсах —
каталог слотов перечисляет их для этого слота:
`harness-ui/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:1877-1882`.
То есть панель может читать текущую сессию и список рабочих пространств из React вообще
без обращения к Cordis; Cordis нужен только для действий (создать/открыть/черновик), и
эти действия удобно замкнуть в `inject`-фасаде записи слота — так и делает
`dsh-plugin-subscriptions` (`src/client/index.ts:85-93`, `:128-132`).

### 1.5. Ограничения и предостережения

- **`inject` плагина — жёсткое требование.** Если объявленная служба не появится, падает
  не плагин, а весь клиентский boot:
  `harness-ui/packages/client/web/src/boot.ts:137-157` собирает список «entries did not
  activate» и бросает. Поэтому в `export const inject` кладём только то, без чего раздел
  бессмыслен (`slots`, `connection`), а `conversation` / `sessions` / `uiWorkspace` /
  `workspaces` безопаснее брать лениво через `ctx.get(...)` в момент нажатия — приём
  из `dsh-plugin-subscriptions/src/client/index.ts:121-122`. **[догадка]** о том, что это
  предпочтительнее: в веб-профиле все четыре службы присутствуют, так что жёсткий `inject`
  тоже сработает; ленивый вариант — страховка на случай урезанного профиля.
- `sessions.scope(id)` возвращает `undefined` для сессии, которой нет ни в списке, ни в
  скопах (`contract/sessions.ts:103`), а `input.for(actx)` на контексте без тега бросает
  `'conversation.input.for requires a session scope'` (`hub.ts:69`). Обе ветки надо
  обрабатывать.
- `setDraft` не склеивается с уже набранным текстом — он заменяет черновик целиком
  (`facade.ts:269-282`, «Replace the whole draft»). Если пользователь уже что-то печатал,
  мы это затрём. Эталон в `apply.ts:221-225` перед записью проверяет, что переносить есть
  что; нам, **[догадка]**, стоит либо спрашивать подтверждение, либо не трогать непустой
  черновик.
- Регистрация внутри диалога (обходной путь, который не понадобился) ограничила бы
  раскладку так: слоты диалога имеют `scope: 'session'` или `'session-maybe'`
  (`harness-ui/packages/client/ui-conversation/src/client/index.ts` — объявления
  `conversation.session`, `conversation.composer`, `conversation.input.dock` в
  `apply.ts:200-209`), то есть панель жила бы внутри центральной колонки, исчезала бы при
  отсутствии текущей сессии и клипалась бы `overflow: hidden` этой колонки
  (`harness-ui/packages/client/ui-layout/src/client/AppFrame.module.css:32-37`). Список
  требований — сущность уровня рабочего пространства, а не сессии, так что это было бы
  прямое ухудшение.

---

## Вопрос 2. Список внешних зависимостей клиентского бандла

### 2.1. Что обязано быть внешним — авторитетный список

Единственный источник истины — `PLATFORM_MODULES`:
`harness-ui/packages/client/web/src/platform.ts:8-13`

```
react, react/jsx-runtime, react-dom, react-dom/client,
@deepseek-ai/cordis,
@deepseek-ai/dsh-client-store,
@deepseek-ai/dsh-client-ui-slots,
@deepseek-ai/dsh-client-ui-primitives
```

`PRELOADED_CLIENT_EXTERNALS` в этой версии пуст (`platform.ts:16-17`).

Это ровно те сущности, которые оболочка кладёт в замороженную таблицу модулей —
`harness-ui/packages/client/web/src/seed.ts:23-37`, где `satisfies Record<PlatformModule,
unknown>` не даёт списку и таблице разъехаться. Рецепт харнесса собирает внешние из того
же списка: `harness-ui/packages/client/tsdown.client.ts:406-416` (`clientExternals` =
`PLATFORM_MODULES` + `PRELOADED_CLIENT_EXTERNALS` + собственные запросы пакета).

### 2.2. Список соседнего плагина разошёлся с платформой

`dsh-plugin-subscriptions/tsdown.config.ts:16-27` объявляет:

```
react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
@deepseek-ai/dsh-client-ui-slots,
@deepseek-ai/dsh-client-web-react,        ← такого пакета в харнессе нет
@deepseek-ai/dsh-client-ui-primitives,
@deepseek-ai/dsh-client-ui-attachment,    ← не в PLATFORM_MODULES
@deepseek-ai/dsh-client-schema-form,      ← такого пакета в харнессе нет
```

и **не содержит** `@deepseek-ai/dsh-client-store`, который в `PLATFORM_MODULES` есть.
Проверено: `ls harness-ui/packages/client/` не показывает ни `web-react`, ни
`schema-form`; `@deepseek-ai/dsh-client-store` — это `harness-ui/packages/client/store/package.json:2`.

Почему у соседа это не взрывается: три лишних специфаера просто ни разу не импортируются
как значения, а `dsh-client-store` не импортируется вовсе. Список внешних сам по себе
безвреден — вред начинается на импорте. **Копировать этот список в наш плагин нельзя:**
если мы возьмём из `@deepseek-ai/dsh-client-store` что-нибудь исполняемое (например
`createSnapshotStore`), при копии списка соседа мы получим либо ошибку сборки, либо, что
хуже, вторую копию хранилища в бандле.

### 2.3. Что произойдёт с пакетом вне списка

Три разных исхода, в зависимости от того, куда пакет попадает:

1. **Value-импорт `@deepseek-ai/*`, которого нет ни в внешних, ни в исключениях →
   ошибка сборки.** Сторож `dsh-client-bundle-purity` бросает в `resolveId`:
   `harness-ui/packages/client/tsdown.client.ts:489-500`, копия у соседа —
   `dsh-plugin-subscriptions/tsdown.config.ts:64-81`. Это самый частый и самый безопасный
   исход: ломается сборка, а не пользователь.
2. **Пакет НЕ из `@deepseek-ai/*` (zod, clsx, date-fns и т. п.) → молча инлайнится
   в бандл.** Сторож смотрит только на префикс `@deepseek-ai/`
   (`tsdown.client.ts:492`, `tsdown.config.ts:72`), а `noExternal` заворачивает внутрь
   всё, чего нет в списке (`tsdown.config.ts:58`; у харнесса то же самое через
   `deps.alwaysBundle`, `tsdown.client.ts:445-453`). Это штатное поведение, но раздувает
   бандл — библиотеку выбираем осознанно.
3. **Специфаер остался внешним, но таблица модулей его не знает → падение в рантайме.**
   `require()` бросает
   `client-modules: require("<spec>") missed the module table — not a platform seed word,
   not a materialized module, and no registered package factory (a build-time externals
   drift, or a dynamic dependency that did not arrive)` —
   `harness-ui/packages/client/modules/src/client/system.ts:207-211` (и парная ветка для
   `import()`, `:222-226`). Комментарий рецепта называет это прямо: «A require() the table
   cannot answer is a guaranteed runtime throw» (`tsdown.client.ts:447-449`).

### 2.4. Легальные исключения из сторожа

Три класса `@deepseek-ai/*`, которые сторож пропускает на инлайн:

- **inline-safe wire-слои** — `harness-ui/packages/client/tsdown.client.ts:61`:
  `dsh-file-reference | dsh-session | dsh-llm | dsh-tools | dsh-brand | dsh-deque |
  dsh-typert-protocol | dsh-util-crypto | dsh-util-values | dsh-util-workspace-path`, плюс
  `dsh-token-meter/client` и `dsh-agent-presets/display`. Регулярка у соседа (`tsdown.config.ts:33`)
  заметно у́же — только `session|llm|tools|brand`. Наш плагин должен взять актуальную
  версию из харнесса.
- **вендоренные библиотеки** — `cosmokit`, `schemastery` (`tsdown.client.ts:69`,
  `tsdown.config.ts:36`).
- **сгенерированные `/remote`-вклады** — `@deepseek-ai/dsh-*/remote`
  (`tsdown.client.ts:72`, `tsdown.config.ts:39`).

### 2.5. Как расширить список легально

Пакету можно попросить дополнительную строку таблицы модулей через
`dsh.client.external` в собственном `package.json`:
`harness-ui/packages/client/tsdown.client.ts:392-397` (`requestedExternals`) и
`harness-ui/packages/client/modules/src/index.ts:57-64` («Any specifier is valid,
including subpaths such as `<pkg>/client`»). Но это сработает только если запрошенный
пакет сам является строкой графа — то есть отдельным клиентским плагином, зарегистрировавшим
свою фабрику (`system.ts:200-213`, `harness-ui/packages/client/modules/src/client/manifest.ts:18-26`).
Для нас это не нужно: см. вопрос 1 — всё берётся службами, а не импортами.

Чтобы наш пакет вообще стал клиентским, `package.json` должен объявить
`dsh.client.platform: "web"` и `exports["./client"]`:
`harness-ui/packages/client/modules/src/index.ts:756-763` (без `platform: 'web'` пакет
просто не попадёт в граф; с `dsh.client`, но без `./client` — бросается ошибка).
Сейчас в `dsh-plugin-bft/package.json:17-19` есть только `dsh.bundle.patch`, ни
`dsh.client`, ни `exports["./client"]` нет — это предстоит добавить.

---

## Вопрос 3. Слой оверлеев, указатель мыши и панель у правого края

### 3.1. Как устроен слой

Слой рендерится последним ребёнком фрейма:
`harness-ui/packages/client/ui-layout/src/client/AppFrame.tsx:210-212`

```jsx
<div className={css.overlayLayer} data-shell-overlay>
  {renderSlot('shell.overlay', {})}
</div>
```

Стили — `harness-ui/packages/client/ui-layout/src/client/AppFrame.module.css:110-119`:

```css
.overlayLayer   { position: absolute; inset: 0; z-index: 20; pointer-events: none; }
.overlayLayer > * { pointer-events: auto; }
```

Слот объявлен как список корневой области:
`harness-ui/packages/client/ui-layout/src/client/index.ts:86` (тип) и `:130-133`
(`'shell.overlay': { kind: 'list', scope: 'root' }`). Занятых записей у него в поставке
нет — каталог показывает `occupants: []`
(`harness-ui/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:1845-1893`),
а документация слота там же формулирует контракт: «The layer itself is click-through —
entries opt back into pointer events — so an occupant never blocks the app underneath»
(`slot-catalog.ts:1849`).

### 3.2. Что на самом деле происходит с указателем — важная тонкость

Правило `> *` попадает **не в наш корневой элемент**, а в служебную обёртку рендерера.
`renderSlot` всегда оборачивает содержимое в якорь:
`harness-ui/packages/client/ui-renderer/src/client/scoped-slots.tsx:716`
(`<div data-slot={slotKey} style={ANCHOR_STYLE}>`), где `ANCHOR_STYLE` — это
`{ display: 'contents' }` (`scoped-slots.tsx:692`). Записи списка рендерятся внутри него
во фрагмент, без дополнительных обёрток (`scoped-slots.tsx:866-871`).

Следствия:

- `pointer-events` — наследуемое свойство CSS, а `display: contents` не создаёт бокса.
  Значит `pointer-events: auto`, поставленный на якорь, **наследуется вниз, на корневой
  элемент нашей записи**. Клики панель получит.
- Обратная сторона: наследование не выборочное. Что бы наша запись ни нарисовала, оно
  будет ловить указатель. Если корневой элемент записи растянуть на весь фрейм
  (`position: absolute; inset: 0`), панель перекроет всё приложение, несмотря на
  `pointer-events: none` у самого слоя.
- Поэтому «не перекрывать остальное приложение» — целиком наша ответственность: либо
  корневой элемент записи занимает только прямоугольник панели, либо он растянут, но с
  явным `pointer-events: none` на себе и `pointer-events: auto` на самой панели.

**[догадка]** насчёт стакинга: `.overlayLayer` с `z-index: 20` создаёт свой контекст
наложения, а `.frame` (`AppFrame.module.css:1-11`) имеет `position: relative` без
`z-index`, то есть контекста не создаёт. Панель настроек с `z-index: 1000` живёт в
`position: fixed` и, по нашему чтению, окажется поверх нашей панели. Проверить это стоит
глазами при первой сборке, а не считать доказанным.

### 3.3. Позиционирование у правого края

`.overlayLayer` — `position: absolute; inset: 0` относительно `.frame`, значит он сам
является содержащим блоком для абсолютно позиционированных потомков (якорь с
`display: contents` бокса не создаёт и на это не влияет). Отсюда панель у правого края —
это просто:

```css
.panel {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 420px;            /* или min(420px, 100vw - 48px) */
  pointer-events: auto;
  overflow: hidden;        /* внутренняя прокрутка своя */
}
```

Никаких `100vh`/`100vw` не нужно — координаты и так меряются от фрейма, а фрейм это и есть
всё окно приложения (`AppFrame.module.css:4-6`: `grid-template-rows: 100%; height: 100%`).

### 3.4. Что берём у полноэкранной панели настроек

`harness-ui/packages/client/ui-settings-general/src/client/SettingsRoot.module.css` —
это другой приём, модальный: слой `position: fixed; inset: 0; z-index: 1000; display: flex`
с центрированием (`:61-68`), отдельная маска-подложка `position: absolute; inset: 0` с
`--dsw-alias-bg-mask-1` и `backdrop-filter` (`:70-75`), и панель поверх неё —
`position: relative; z-index: 1`, фиксированная ширина `800px`, высота
`min(800px, calc(100vh - 48px))`, `max-width: calc(100vw - 48px)`, `border-radius: 32px`,
`overflow: hidden`, фон `--dsw-alias-bg-layer-2`, тень `--dsw-elevation-prominent`
(`:82-100`). Регистрируется она не в оверлее, а в слоте сайдбара
(`.../SettingsRoot`, регистрация — `ui-settings-general/src/client/index.ts:146`), и из
колонки её вытаскивает именно `position: fixed`.

Что оттуда стоит перенести один в один, не изобретая своего:

- токены поверхности: `--dsw-alias-bg-layer-2`, `--dsw-elevation-prominent`,
  `--dsw-alias-border-l3`;
- перепривязка скроллбара на приподнятой поверхности —
  `--dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2)` и `-hover` объявляются на самой
  панели и наследуются вниз к тому потомку, который реально прокручивается
  (`SettingsRoot.module.css:93-100`);
- принцип «высота от вьюпорта, а не от содержимого», чтобы панель не прыгала под курсором
  при переключении разделов (`SettingsRoot.module.css:77-81`).

Чего оттуда брать НЕ надо: маску и центрирование. Наша панель — не модалка, приложение под
ней должно оставаться живым и кликабельным.

---

## Выводы для реализации

**1. Где будет кнопка запуска чата.** В самой панели раздела, зарегистрированной в
`shell.overlay` — обходной путь через слоты диалога не нужен. Обработчик кнопки не делает
ничего в React: он зовёт замыкание, переданное панели через `inject`-фасад записи слота
(приём `dsh-plugin-subscriptions/src/client/index.ts:85-93`), а внутри замыкания —
последовательность из §1.3: `uiWorkspace.connectWorkspace(workspaceId)` →
`sessions.scope(id)` → `conversation.input.for(actx).setDraft(text)` → `sessions.open(id)`.
Текущее рабочее пространство панель знает из стандартных хуков `useSessions`/`useWorkspaces`
(`slot-catalog.ts:1877-1882`) либо выводит так же, как `startSession`
(`navigation.ts:114-121`). Отправку не делаем — только черновик. В `export const inject`
кладём `['slots', 'connection']`; `conversation`, `sessions`, `uiWorkspace`, `workspaces`
берём лениво через `ctx.get(...)`, чтобы отсутствие любой из них не роняло весь boot
(`harness-ui/packages/client/web/src/boot.ts:137-157`).

**2. Какой список внешних зависимостей брать.** Не копию соседа, а актуальный
`PLATFORM_MODULES` из `harness-ui/packages/client/web/src/platform.ts:8-13`:

```
'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
'@deepseek-ai/cordis',
'@deepseek-ai/dsh-client-store',
'@deepseek-ai/dsh-client-ui-slots',
'@deepseek-ai/dsh-client-ui-primitives'
```

Ровно восемь строк, ничего сверх. Из `dsh-plugin-subscriptions/tsdown.config.ts`
переиспользуем структуру конфига целиком (`outDir: 'lib'`, `format: 'cjs'`,
`platform: 'browser'`, `dts: false`, `clean: false`, `noExternal` — `:41-63`;
`outputOptions` с banner/footer/intro и `entryFileNames: 'client.js'` — `:82-87`; имя в
banner меняем на `dsh-plugin-bft`), а вот регулярки исключений берём из харнесса, а не у
соседа: `INLINE_SAFE` — `tsdown.client.ts:61`, `VENDORED_LIBRARY` — `:69`,
`GENERATED_REMOTE` — `:72`. Отдельно в `package.json` добавляем
`dsh.client.platform: "web"` и `exports["./client"]`, иначе бандл в граф не попадёт
(`harness-ui/packages/client/modules/src/index.ts:756-763`).

**3. Как позиционировать панель.** Одна запись `kind: 'list'`, `scope: 'root'` в
`shell.overlay` со своим `id` (например `bft-requirements`) — добавляется рядом с чужими
записями, ничего не затеняет (`slot-catalog.ts:1849`, «a fresh `id` is added beside the shipped entries»). Корневой элемент записи —
`position: absolute; top: 0; right: 0; bottom: 0; width: 420px; pointer-events: auto`,
координаты меряются от `.overlayLayer` (`AppFrame.module.css:110-115`). Категорически не
растягивать корневой элемент на `inset: 0` без `pointer-events: none` на нём самом:
`pointer-events: auto` наследуется через якорь `display: contents`
(`scoped-slots.tsx:692`, `:716`) и такая панель перехватит клики по всему приложению.
Поверхность оформляем токенами панели настроек (`SettingsRoot.module.css:82-100`), но без
маски и центрирования — раздел не модальный.
