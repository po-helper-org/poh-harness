#!/usr/bin/env bash
# Установщик контура: поднимает DeepSeek Harness с плагинами и настройками этого
# репозитория. Идемпотентен — повторный запуск обновляет, а не ломает.
#
#   ./install.sh                      # воркспейс спросит интерактивно
#   ./install.sh --workspace ~/proj/x # без вопросов
#   ./install.sh --skip-build         # быстрее, если харнесс уже собран
#
# Что делает по шагам — см. docs/ONBOARDING.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$REPO_ROOT/harness"
HARNESS_REPO="https://github.com/deepseek-ai/deepseek-harness.git"
# Версия, на которой контур собран и проверен. Обновление — отдельным решением:
# API плагинов у харнесса ещё alpha и меняется между версиями.
HARNESS_PIN="49a606bc5b5934603f22a26957a07dc799ab0291"
PROFILE_NAME="web"

WORKSPACE_ROOT=""
SKIP_BUILD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --workspace) WORKSPACE_ROOT="${2:-}"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Проверка окружения ─────────────────────────────────────────────────────
say "Проверяю окружение"

command -v git >/dev/null || die "нужен git"
command -v node >/dev/null || die "нужен Node.js 22.19+ или 24+ (https://nodejs.org)"
command -v pnpm >/dev/null || die "нужен pnpm: corepack enable && corepack prepare pnpm@11.7.0 --activate"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  die "Node $(node -v): харнессу нужен ^22.19.0 или >=24"
fi
echo "  node $(node -v), pnpm $(pnpm -v)"

if ! command -v backlog >/dev/null; then
  echo "  ⚠ backlog не найден в PATH — раздел «Управление требованиями» будет пустым."
  echo "    Поставить: npm i -g backlog.md   (https://github.com/MrLesk/Backlog.md)"
fi

# ── 2. Рабочий каталог ────────────────────────────────────────────────────────
if [ -z "$WORKSPACE_ROOT" ]; then
  say "Рабочий каталог"
  echo "  Это репозиторий, требования которого вы ведёте: внутри лежат backlog/ и bft/."
  echo "  Не каталог харнесса. Можно указать любой существующий — контур подстроится."
  printf '  Путь [%s]: ' "$HOME/projects"
  read -r WORKSPACE_ROOT
  WORKSPACE_ROOT="${WORKSPACE_ROOT:-$HOME/projects}"
fi
WORKSPACE_ROOT="${WORKSPACE_ROOT/#\~/$HOME}"
[ -d "$WORKSPACE_ROOT" ] || die "каталога нет: $WORKSPACE_ROOT"
WORKSPACE_ROOT="$(cd "$WORKSPACE_ROOT" && pwd)"
echo "  Воркспейс: $WORKSPACE_ROOT"

# ── 3. Харнесс на закреплённой версии ─────────────────────────────────────────
say "DeepSeek Harness (upstream, MIT)"
if [ ! -d "$HARNESS_DIR/.git" ]; then
  echo "  Клонирую $HARNESS_REPO"
  git clone --filter=blob:none "$HARNESS_REPO" "$HARNESS_DIR"
fi
git -C "$HARNESS_DIR" fetch --quiet origin "$HARNESS_PIN" 2>/dev/null || git -C "$HARNESS_DIR" fetch --quiet origin
if [ "$(git -C "$HARNESS_DIR" rev-parse HEAD)" != "$HARNESS_PIN" ]; then
  git -C "$HARNESS_DIR" checkout --quiet --detach "$HARNESS_PIN"
fi
echo "  Версия: $(git -C "$HARNESS_DIR" describe --tags --always)"

# ── 4. Сборка харнесса ────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  say "Собираю харнесс (первый раз это долго)"
  (cd "$HARNESS_DIR" && pnpm install --frozen-lockfile && pnpm build)
else
  echo "  --skip-build: сборку харнесса пропускаю"
fi

# ── 5. Наш плагин ─────────────────────────────────────────────────────────────
say "Собираю dsh-plugin-bft"
(cd "$REPO_ROOT/plugins/dsh-plugin-bft" && pnpm install && pnpm build)

# ── 6. Профиль ────────────────────────────────────────────────────────────────
# Штатная `dsh plugin --profile web add` рапортует успех, но манифест профиля не
# обновляет (issue #37, см. docs/TROUBLESHOOTING.md) — поэтому профиль пишется
# напрямую из шаблонов.
say "Настраиваю профиль «$PROFILE_NAME»"
PROFILE_DIR="$HARNESS_DIR/.dsh-data/profiles/$PROFILE_NAME"
mkdir -p "$PROFILE_DIR"

for f in package.json cordis.patch.yml; do
  if [ -f "$PROFILE_DIR/$f" ] && ! cmp -s "$PROFILE_DIR/$f" "$PROFILE_DIR/$f.bak" 2>/dev/null; then
    cp "$PROFILE_DIR/$f" "$PROFILE_DIR/$f.bak"
  fi
done

sed -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
    "$REPO_ROOT/profile/package.json.tmpl" > "$PROFILE_DIR/package.json"
sed -e "s|__WORKSPACE_ROOT__|$WORKSPACE_ROOT|g" \
    "$REPO_ROOT/profile/cordis.patch.yml.tmpl" > "$PROFILE_DIR/cordis.patch.yml"
echo "  Записано: $PROFILE_DIR/{package.json,cordis.patch.yml}"
echo "  Прежние версии, если были: *.bak рядом"

say "Ставлю плагины профиля"
(cd "$PROFILE_DIR" && pnpm install)

# ── 7. Готово ─────────────────────────────────────────────────────────────────
cat <<EOF

$(printf '\033[32m✓ Контур установлен\033[0m')

Запуск:      ./scripts/start-web.sh
             Ссылку с токеном скрипт напечатает сам.

Дальше:      docs/ONBOARDING.md — подключение подписки (шаг 4)
                                  и настройка окружения (шаг 5)
EOF
