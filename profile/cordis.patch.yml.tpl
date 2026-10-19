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

# ── Раздел «Управление требованиями» (poh-bft-plugin) ─────────────────────────
# Строка монтирования приходит из собственного cordis.patch.yml плагина
# (skills/poh-bft-writer/plugin/cordis.patch.yml); здесь — то, что зависит от
# машины и раскладки воркспейса. Полный список ключей — README плагина.
#
# docsPath/indexPath: демо-воркспейс держит документы в bft/, а не в .bft/ —
# заданный явно путь в плагине запасных не имеет, поэтому указываем свой.
# entireRequired: false — без адреса entire.io (entireBaseUrl) плагин иначе не
# стартует вовсе; задайте entireBaseUrl и уберите эту строку, если он есть.
# claudeBin: чат по требованию через Claude Code CLI; `off` — черновик уходит в
# композер харнесса. Умолчание — `claude` из PATH.
# formUrl / sheetUrl / syncPrompt правятся в интерфейсе (Plugins → Требования)
# и дописываются сюда самим харнессом.
- id: bft-requirements
  config:
    workspaceRoot: '__WORKSPACE__'
    docsPath: bft/documentation
    indexPath: bft/index
    entireRequired: false
