#!/usr/bin/env bash
# Установщик контура: разворачивает DeepSeek Harness (npm) + плагины и скиллы
# этого репозитория. Идемпотентен — повторный запуск обновляет, а не ломает.
#
#   ./install.sh                        # воркспейс спросит интерактивно (Enter — demo)
#   ./install.sh --workspace ~/proj/x   # без вопросов, свой воркспейс
#   ./install.sh --with-caveman         # + плагин caveman-style (глобальный стиль ответов)
#   ./install.sh --skip-build           # быстрее, если плагины уже собраны
#   ./install.sh --check                # доктор: ничего не меняет, только проверяет
#
# Что делает по шагам — см. docs/ONBOARDING.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Версия харнесса, на которой контур собран и проверен (dist-tag `alpha` на
# npm). Обновление — отдельным решением: API плагинов у харнесса ещё alpha и
# меняется между версиями. Один пин на весь набор @deepseek-ai/dsh-* бандлов.
HARNESS_VERSION="0.1.7-rc.2"
SUBSCRIPTIONS_VERSION="^0.9.6"
RESULT_ONLY_VIEW_VERSION="^1.6.4"
LLM_PI_AI_VERSION="0.1.7-rc.2"
PROFILE_NAME="web"
DSH_HOME="$REPO_ROOT/.dsh-data"

WORKSPACE_ROOT=""
SKIP_BUILD=0
WITH_CAVEMAN=0
CHECK_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --workspace) WORKSPACE_ROOT="${2:-}"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --with-caveman) WITH_CAVEMAN=1; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
DOCTOR_FAIL=0
doctor_fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; DOCTOR_FAIL=1; }

# ── 1. Проверка окружения ─────────────────────────────────────────────────────
say "Проверяю окружение"

if [ "$CHECK_ONLY" -eq 1 ]; then
  command -v git >/dev/null && ok "git: $(git --version)" || doctor_fail "git не найден"
  command -v node >/dev/null && ok "node: $(node -v)" || doctor_fail "node не найден"
  command -v pnpm >/dev/null && ok "pnpm: $(pnpm -v)" || doctor_fail "pnpm не найден"
else
  command -v git >/dev/null || die "нужен git"
  command -v node >/dev/null || die "нужен Node.js 22.19+ или 24+ (https://nodejs.org)"
  command -v pnpm >/dev/null || die "нужен pnpm: corepack enable && corepack prepare pnpm@11.7.0 --activate"
fi

if command -v node >/dev/null; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
  if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
    if [ "$CHECK_ONLY" -eq 1 ]; then doctor_fail "Node $(node -v): нужен ^22.19.0 или >=24"
    else die "Node $(node -v): харнессу нужен ^22.19.0 или >=24"; fi
  fi
fi

if command -v backlog >/dev/null; then
  [ "$CHECK_ONLY" -eq 1 ] && ok "backlog: $(backlog --version 2>/dev/null || echo найден)"
else
  warn "backlog не найден в PATH — раздел «Управление требованиями» будет пустым."
  echo "    Поставить: npm i -g backlog.md   (https://github.com/MrLesk/Backlog.md)"
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  say "Проверяю установленный контур"
  [ -x "$REPO_ROOT/node_modules/.bin/dsh" ] && ok "dsh CLI установлен" \
    || doctor_fail "dsh CLI не найден — прогоните ./install.sh"
  [ -d "$DSH_HOME/profiles/$PROFILE_NAME" ] && ok "профиль $PROFILE_NAME сгенерирован" \
    || doctor_fail "профиль $PROFILE_NAME не найден — прогоните ./install.sh"
  [ -d "$DSH_HOME/profiles/$PROFILE_NAME/node_modules" ] && ok "зависимости профиля установлены" \
    || doctor_fail "node_modules профиля отсутствуют — прогоните ./install.sh"
  [ -d "$REPO_ROOT/plugins/dsh-plugin-bft/lib" ] && ok "dsh-plugin-bft собран" \
    || doctor_fail "dsh-plugin-bft не собран — прогоните ./install.sh (без --skip-build)"
  if command -v lsof >/dev/null && lsof -i ":${PORT:-3082}" >/dev/null 2>&1; then
    ok "порт ${PORT:-3082} слушается — контур, похоже, запущен"
  else
    warn "порт ${PORT:-3082} не слушается — контур не запущен (см. ./scripts/start-web.sh)"
  fi
  echo
  if [ "$DOCTOR_FAIL" -eq 0 ]; then
    printf '\033[32m✓ Всё в порядке\033[0m\n'
    exit 0
  else
    printf '\033[31m✗ Есть проблемы, см. выше\033[0m\n'
    exit 1
  fi
fi

echo "  node $(node -v), pnpm $(pnpm -v)"

# ── 2. Рабочий каталог ────────────────────────────────────────────────────────
if [ -z "$WORKSPACE_ROOT" ]; then
  say "Рабочий каталог"
  echo "  Это репозиторий, требования которого вы ведёте: внутри лежат backlog/ и bft/."
  echo "  Не каталог харнесса. Пустой ввод — демо-воркспейс из этого репозитория"
  echo "  ($REPO_ROOT/workspace), чтобы сразу увидеть раздел требований на примерах."
  printf '  Путь [demo]: '
  read -r WORKSPACE_ROOT
fi
if [ -z "$WORKSPACE_ROOT" ]; then
  WORKSPACE_ROOT="$REPO_ROOT/workspace"
  echo "  Воркспейс: $WORKSPACE_ROOT (демо)"
else
  WORKSPACE_ROOT="${WORKSPACE_ROOT/#\~/$HOME}"
  [ -d "$WORKSPACE_ROOT" ] || die "каталога нет: $WORKSPACE_ROOT"
  WORKSPACE_ROOT="$(cd "$WORKSPACE_ROOT" && pwd)"
  echo "  Воркспейс: $WORKSPACE_ROOT"
fi

# Защита от утечек: pre-commit хук scripts/check-leaks.sh (репозиторий публичный,
# а воркспейс PO рядом с рабочими данными). Идемпотентно.
if [ "$CHECK_ONLY" -eq 0 ] && git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$REPO_ROOT" config core.hooksPath .githooks
fi

# ── 3. Скиллы: submodule'ы ────────────────────────────────────────────────────
say "Скиллы воркспейса (git submodules)"
if [ -f "$REPO_ROOT/.gitmodules" ]; then
  git -C "$REPO_ROOT" submodule update --init --recursive
  ok "skills/poh-bft-writer, skills/poh-okr-agent, skills/poh-sprint-agents, skills/poh-helper"
else
  warn ".gitmodules не найден — пропускаю (клон без submodule'ов?)"
fi

# Один список customSkillDirs для строки skill-filesystem. Порядок в массиве —
# это порядок разрешения дублей внутри ранга `custom` (rank 300, первый по
# порядку побеждает — см. @deepseek-ai/dsh-skill-filesystem +
# @deepseek-ai/dsh-skill README): poh-bft-writer должен идти РАНЬШЕ poh-helper,
# иначе его bft-writer/bft-fast/bft-deep-swarm перекроются одноимёнными
# скиллами из poh-helper. poh-sprint-agents — РАНЬШЕ poh-helper по той же
# причине: его новый sprint-planner должен перекрыть архивный из poh-helper.
SKILL_DIRS_YAML="      - '$REPO_ROOT/skills/poh-bft-writer/skills'
      - '$REPO_ROOT/skills/poh-okr-agent/skills'
      - '$REPO_ROOT/skills/poh-sprint-agents/.claude/skills'
      - '$REPO_ROOT/skills/poh-helper/.claude/skills'"

# ── 4. dsh CLI ─────────────────────────────────────────────────────────────────
# @deepseek-ai/dsh — просто npm-пакет с бинарником `dsh` (см. root package.json),
# как npx @deepseek-ai/dsh web в апстриме. Устанавливается в корне репозитория,
# а не в профиле: профиль поставляет только бандлы плагинов (пункт 6 ниже),
# сам загрузчик резолвится через $PATH из node_modules/.bin.
say "Ставлю dsh CLI (@deepseek-ai/dsh@$HARNESS_VERSION)"
(cd "$REPO_ROOT" && pnpm install)

# ── 5. Локальные плагины ──────────────────────────────────────────────────────
PLUGIN_LIST="dsh-plugin-bft poh-mobile-skin"
VENDOR_PLUGINS="poh-morning-plugin dsh-communication-plugin"
if [ "$WITH_CAVEMAN" -eq 1 ]; then
  PLUGIN_LIST="$PLUGIN_LIST dsh-plugin-caveman"
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  say "Собираю локальные плагины ($PLUGIN_LIST)"
  for p in $PLUGIN_LIST; do
    echo "  · $p"
    (cd "$REPO_ROOT/plugins/$p" && pnpm install && pnpm build)
  done
  say "Собираю vendor-плагины ($VENDOR_PLUGINS)"
  for p in $VENDOR_PLUGINS; do
    echo "  · $p"
    case "$p" in
      poh-morning-plugin)      d="$REPO_ROOT/vendor/poh-morning-status/poh-morning-plugin" ;;
      dsh-communication-plugin) d="$REPO_ROOT/vendor/dsh-communication-plugin" ;;
      *) die "неизвестный vendor-плагин: $p" ;;
    esac
    (cd "$d" && pnpm install && pnpm build)
  done
else
  echo "  --skip-build: сборку плагинов пропускаю"
fi

# ── 6. Профиль ────────────────────────────────────────────────────────────────
# Штатная `dsh plugin --profile web add` рапортует успех, но манифест профиля не
# обновляет (issue #37, см. docs/TROUBLESHOOTING.md) — поэтому профиль пишется
# напрямую из шаблонов, а харнесс ставится обычной npm-зависимостью в манифесте
# профиля, без клонирования исходников (`npx @deepseek-ai/dsh web` делает так же).
say "Настраиваю профиль '$PROFILE_NAME'"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE_NAME"
mkdir -p "$PROFILE_DIR"

BUNDLES_JSON='"@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-plugin-subscriptions", "dsh-plugin-bft", "dsh-result-only-view", "poh-morning-plugin", "dsh-communication-plugin", "poh-mobile-skin"'
PLUGIN_DEPS_JSON='"dsh-plugin-bft": "link:'"$REPO_ROOT"'/plugins/dsh-plugin-bft",
    "dsh-plugin-subscriptions": "'"$SUBSCRIPTIONS_VERSION"'",
    "dsh-result-only-view": "'"$RESULT_ONLY_VIEW_VERSION"'",
    "@deepseek-ai/dsh-llm-pi-ai": "'"$LLM_PI_AI_VERSION"'",
    "poh-morning-plugin": "link:'"$REPO_ROOT"'/vendor/poh-morning-status/poh-morning-plugin",
    "dsh-communication-plugin": "link:'"$REPO_ROOT"'/vendor/dsh-communication-plugin",
    "poh-mobile-skin": "link:'"$REPO_ROOT"'/plugins/poh-mobile-skin"'
if [ "$WITH_CAVEMAN" -eq 1 ]; then
  BUNDLES_JSON="$BUNDLES_JSON, \"dsh-plugin-caveman\""
  PLUGIN_DEPS_JSON="$PLUGIN_DEPS_JSON,
    \"dsh-plugin-caveman\": \"link:$REPO_ROOT/plugins/dsh-plugin-caveman\""
fi

# __BUNDLES__/__PLUGIN_DEPS__/__SKILL_DIRS__ can each span several lines — BSD
# sed rejects a multi-line replacement pattern, so template rendering goes
# through this small perl substitution instead (env vars survive embedded
# `|`, `'`, `/` unlike a sed script built by string interpolation).
render_template() {
  REPO_ROOT="$REPO_ROOT" HARNESS_VERSION="$HARNESS_VERSION" \
  WORKSPACE_ROOT="$WORKSPACE_ROOT" BUNDLES_JSON="$BUNDLES_JSON" \
  PLUGIN_DEPS_JSON="$PLUGIN_DEPS_JSON" SKILL_DIRS_YAML="$SKILL_DIRS_YAML" \
  perl -pe '
    BEGIN {
      $repo = $ENV{REPO_ROOT}; $hv = $ENV{HARNESS_VERSION};
      $ws = $ENV{WORKSPACE_ROOT}; $bundles = $ENV{BUNDLES_JSON};
      $deps = $ENV{PLUGIN_DEPS_JSON}; $dirs = $ENV{SKILL_DIRS_YAML};
    }
    s/__REPO_ROOT__/$repo/g;
    s/__HARNESS_VERSION__/$hv/g;
    s/__WORKSPACE__/$ws/g;
    s/__BUNDLES__/$bundles/g;
    s/__PLUGIN_DEPS__/$deps/g;
    s/__SKILL_DIRS__/$dirs/g;
  ' "$1"
}

NEW_PACKAGE_JSON="$(render_template "$REPO_ROOT/profile/package.json.tpl")"
NEW_CORDIS_PATCH="$(render_template "$REPO_ROOT/profile/cordis.patch.yml.tpl")"
NEW_PNPM_WORKSPACE="$(render_template "$REPO_ROOT/profile/pnpm-workspace.yaml.tpl")"
if [ "$WITH_CAVEMAN" -eq 1 ]; then
  NEW_CORDIS_PATCH="$NEW_CORDIS_PATCH
$(render_template "$REPO_ROOT/profile/caveman-style.cordis.yml.tpl")"
fi

for pair in "package.json:$NEW_PACKAGE_JSON" "cordis.patch.yml:$NEW_CORDIS_PATCH" "pnpm-workspace.yaml:$NEW_PNPM_WORKSPACE"; do
  f="${pair%%:*}"
  content="${pair#*:}"
  if [ -f "$PROFILE_DIR/$f" ] && ! printf '%s\n' "$content" | cmp -s - "$PROFILE_DIR/$f"; then
    BAK="$PROFILE_DIR/$f.bak-$(date +%Y%m%d%H%M%S)"
    cp "$PROFILE_DIR/$f" "$BAK"
    echo "  Расхождение с прежней версией — бэкап: $BAK"
  fi
done

printf '%s\n' "$NEW_PACKAGE_JSON" > "$PROFILE_DIR/package.json"
printf '%s\n' "$NEW_CORDIS_PATCH" > "$PROFILE_DIR/cordis.patch.yml"
printf '%s\n' "$NEW_PNPM_WORKSPACE" > "$PROFILE_DIR/pnpm-workspace.yaml"
echo "  Записано: $PROFILE_DIR/{package.json,cordis.patch.yml,pnpm-workspace.yaml}"

say "Ставлю npm-зависимости профиля (харнесс @$HARNESS_VERSION + плагины)"
# Патчи pnpm (patchedDependencies из pnpm-workspace.yaml.tpl) живут в репо,
# а применяются относительно каталога профиля — копируем их туда.
if [ -d "$REPO_ROOT/profile/patches" ]; then
  mkdir -p "$PROFILE_DIR/patches"
  cp "$REPO_ROOT/profile/patches/"*.patch "$PROFILE_DIR/patches/" 2>/dev/null || true
fi
(cd "$PROFILE_DIR" && pnpm install)

# ── 7. Автозапуск (опционально) ───────────────────────────────────────────────
# Без явного флага ничего не ставится — ручной запуск через ./scripts/start-web.sh
# описан в docs/RUNNING.md. Шаблоны юнитов лежат в scripts/ для тех, кто хочет
# автозапуск при логине: launchd на macOS, systemd --user на Linux.

# ── 8. Готово ─────────────────────────────────────────────────────────────────
cat <<EOF

$(printf '\033[32m✓ Контур установлен\033[0m')

Запуск:      ./scripts/start-web.sh
             Ссылку с токеном скрипт напечатает сам.

Дальше:      docs/ONBOARDING.md — подключение подписки (шаг 4)
                                  и настройка окружения (шаг 5)
Проверка:    ./install.sh --check
Автозапуск:  docs/RUNNING.md — launchd (macOS) / systemd --user (Linux)
EOF
