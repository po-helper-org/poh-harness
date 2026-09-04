#!/usr/bin/env bash
# Запуск харнесса на 127.0.0.1:3082 с данными и профилем этого репозитория.
#
#   ./scripts/start-web.sh              # порт 3082
#   PORT=3090 ./scripts/start-web.sh    # другой порт
#
# Ссылку с токеном доступа печатает сам dsh: `dsh web: http://127.0.0.1:PORT/?token=…`.
# Токен меняется при каждом рестарте — старая вкладка после перезапуска отвалится,
# просто возьмите новую ссылку из вывода.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3082}"

[ -x "$REPO_ROOT/node_modules/.bin/dsh" ] || {
  echo "Контур не установлен — сначала ./install.sh" >&2
  exit 1
}

# Данные (сессии, логины, профили) живут внутри репозитория, а не в глобальном
# ~/.dsh — контур ничего не подмешивает в вашу личную установку харнесса и не
# зависит от неё. Каталог в .gitignore: там же лежат учётные данные подписки.
export DSH_HOME="$REPO_ROOT/.dsh-data"

cd "$REPO_ROOT"
exec node_modules/.bin/dsh web --no-open --port "$PORT"
