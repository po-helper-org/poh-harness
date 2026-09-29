# Слой патчей профиля `web`: массив записей загрузчика, применяется поверх всех
# бандлов профиля. Этот файл генерируется из шаблона скриптом install.sh —
# правьте `profile/cordis.patch.yml.tpl` в репозитории, а не копию в
# .dsh-data/profiles/web/, иначе следующий прогон install.sh её перезапишет.
#
# __WORKSPACE__ подставляется установщиком: это корень рабочего каталога, где
# лежат ваш backlog/ и bft/ — то есть репозиторий, требования которого вы
# ведёте (по умолчанию — демо-воркспейс этого репозитория, workspace/). Это
# НЕ каталог самого харнесса — харнесс приезжает npm-зависимостью, без клона.

# ── Backlog.md как нативные инструменты ───────────────────────────────────────
# https://github.com/MrLesk/Backlog.md через общий MCP-мост. Требует, чтобы
# `backlog` был в PATH (см. docs/ONBOARDING.md).
- insert:
    - id: backlog-md
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: backlog
        transport: stdio
        command: backlog
        args: ['mcp', 'start']
        cwd: '__WORKSPACE__'
        env: {}

# ── Context7 как нативные инструменты ─────────────────────────────────────────
# https://context7.com — актуальная документация библиотек. Streamable HTTP,
# на дефолтном рейт-лимите ключ не нужен.
- insert:
    - id: context7
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: context7
        transport: streamable-http
        url: 'https://mcp.context7.com/mcp'
        headers: {}

# ── Скиллы как нативный skill-root ────────────────────────────────────────────
# Профиль dsh-web-app по умолчанию выключает и skill-filesystem, и tool-skill
# (проверяется через `dsh --profile web --dump-config`). Без явного включения
# обоих customSkillDirs задан, но мёртв, а самого инструмента `skill` у модели
# просто нет.
#
# Список ниже собирает install.sh из корней submodule'ов skills/ (см. §5
# дизайна репозитория) плюс воркспейс. Порядок элементов — это порядок
# разрешения дублей внутри ранга `custom` (все элементы массива делят один
# rank 300; первый по порядку побеждает — см. README пакетов
# @deepseek-ai/dsh-skill-filesystem и @deepseek-ai/dsh-skill): poh-bft-writer
# идёт раньше poh-helper, поэтому его bft-writer/bft-fast/bft-deep-swarm не
# перекрываются одноимёнными скиллами из poh-helper.
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  disabled: false
  config:
    customSkillDirs:
__SKILL_DIRS__
      - '__WORKSPACE__/.claude/skills'
- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
  disabled: false

# ── Раздел «Управление требованиями» (dsh-plugin-bft) ─────────────────────────
# Строка монтирования плагина приходит из его собственного cordis.patch.yml
# (plugins/dsh-plugin-bft/cordis.patch.yml); здесь задаётся только обязательный
# workspaceRoot — он свой на каждой машине, поэтому в пакет не зашит.
- id: bft-requirements
  config:
    workspaceRoot: '__WORKSPACE__'

# ── Утренний бриф PO (poh-morning-plugin) ──────────────────────────────────────
# Провайдер навыков /morning + /mts-link-sync из vendor/poh-morning-status.
# Каталог skills/ плагин находит сам (рядом с пакетом); конфиг пуст.
- id: morning-status
  config: {}

# ── Inbox «Управление коммуникацией» (dsh-communication-plugin) ────────────────
# Читает базу заявок относительно workspaceRoot; сбор идёт отдельным процессом
# (node bin/collect.mjs в каталоге плагина) — см. vendor/dsh-communication-plugin.
- id: communication-inbox
  config:
    workspaceRoot: '__WORKSPACE__'

# ── Мобильный скин (poh-mobile-skin) ───────────────────────────────────────────
# CSS-адаптация под узкий экран: drawer-сайдбар, вертикальные иконки плагинов.
# Конфигурации нет — плагин только вставляет стили в браузере.
- id: poh-mobile-skin
  config: {}

# ── LLM-провайдер Z.AI (GLM) через pi-ai ──────────────────────────────────────
# Тот же ZAI_API_KEY, что у Hermes-агентов: значение живёт в окружении процесса
# (systemd EnvironmentFile, в git не попадает), конфиг несёт только ссылку
# apiKeyEnv — секретов в репозитории нет. Роут zai наследует каталог pi-ai
# (api.z.ai coding endpoint): glm-4.7, glm-5-turbo, glm-5.2, glm-5.3 и др.
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      zai:
        apiKeyEnv: ZAI_API_KEY
