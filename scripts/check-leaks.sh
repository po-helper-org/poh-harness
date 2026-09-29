#!/usr/bin/env bash
# Проверка на утечки перед коммитом/PR: репозиторий публичный, а рабочий
# воркспейс PO лежит рядом с реальными данными (Inbox, брифы, отчёты Jira,
# токены в env). Скрипт смотрит ТОЛЬКО то, что уходит в git:
#
#   scripts/check-leaks.sh                 # staged-изменения (pre-commit hook)
#   scripts/check-leaks.sh origin/main...  # диапазон коммитов (CI на PR)
#
# Блокирует: пути с рабочими данными и секретами; строки с токенами/ключами,
# корпоративными хостами, email и телефонами. Личные шаблоны (своё ФИО, хосты,
# id досок) добавляйте в .leakcheck.local — по одному ERE на строку, файл в
# .gitignore. Ложное срабатывание в конкретной строке: допишите в неё
# `leakcheck:allow`.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
RANGE="${1:-}"

# ── Пути, которым не место в публичном репо ──────────────────────────────────
BLOCKED_PATHS='(^|/)\.dsh-data/|(^|/)\.env($|\.)|\.credentials|(^|/)secrets/|\.(db|sqlite3?|db-wal|db-shm|pem|key|p12)$|\.bak($|-)|^workspace/(communication|reports|GROUND/PULSE)/|^workspace/sprint-report\.(config\.toml|lock\.json)$'
# шаблоны-примеры разрешены
ALLOWED_PATHS='\.example$|(^|/)\.env\.example$'

# ── Содержимое ───────────────────────────────────────────────────────────────
PATTERNS=(
  'gh[pousr]_[A-Za-z0-9]{20,}'                  # GitHub tokens
  'github_pat_[A-Za-z0-9_]{20,}'
  'sk-[A-Za-z0-9_-]{20,}'                        # OpenAI/Anthropic-подобные ключи
  'xox[abprs]-[A-Za-z0-9-]{10,}'                 # Slack
  'AKIA[0-9A-Z]{16}'                             # AWS
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.'  # JWT
  # ключ = значение: строка в кавычках или длинный «шум» без _ и скобок
  # (так не ловится присваивание вида token = read_token_from_journal())
  '(api[_-]?key|token|secret|passw(or)?d)["'"'"' ]*[:=][ ]*["'"'"'][A-Za-z0-9_/+=.-]{16,}'
  '(api[_-]?key|token|secret|passw(or)?d)["'"'"' ]*[:=][ ]*[A-Za-z0-9/+=-]{16,}'
  '[?&]token=[A-Za-z0-9_-]{8,}'                  # launch-токен dsh в ссылке
  '([a-z0-9-]+\.)*mts\.ru'                       # корпоративные хосты
  'customfield_[0-9]{4,}'                        # id полей конкретного Jira
  # email (кроме example/noreply, см. ниже); домен с буквой — не ловит pkg@1.2.3
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]*[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'
  '\+7[ (-]*[0-9]{3}[ )-]*[0-9]{3}[ -]*[0-9]{2}[ -]*[0-9]{2}' # телефоны РФ
)
EMAIL_OK='@(example\.(com|org|net)|users\.noreply\.github\.com)|noreply@|git@github\.com'

if [ -f .leakcheck.local ]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    PATTERNS+=("$line")
  done < .leakcheck.local
fi

if [ -n "$RANGE" ]; then
  names=$(git diff --name-only --diff-filter=ACMR "$RANGE")
  diff=$(git diff -U0 --diff-filter=ACMR "$RANGE")
else
  names=$(git diff --cached --name-only --diff-filter=ACMR)
  diff=$(git diff --cached -U0 --diff-filter=ACMR)
fi

fail=0
report() { echo "  ✘ $*" >&2; fail=1; }

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [[ "$f" =~ $BLOCKED_PATHS ]] && ! [[ "$f" =~ $ALLOWED_PATHS ]]; then
    report "путь с рабочими данными/секретами: $f"
  fi
done <<< "$names"

# Добавленные строки по файлам; сам скрипт и lock-файлы пакетов не сканируем
file=""
while IFS= read -r line; do
  if [[ "$line" == "+++ b/"* ]]; then file="${line#+++ b/}"; continue; fi
  [[ "$line" == +* ]] || continue
  case "$file" in scripts/check-leaks.sh|*pnpm-lock.yaml|*package-lock.json) continue ;; esac
  text="${line#+}"
  [[ "$text" == *leakcheck:allow* ]] && continue
  for p in "${PATTERNS[@]}"; do
    if m=$(grep -oiE -e "$p" <<< "$text" | head -1) && [ -n "$m" ]; then
      if [[ "$m" == *@* ]] && grep -qiE "$EMAIL_OK" <<< "$m"; then continue; fi
      report "$file: «${m:0:60}»"
    fi
  done
done <<< "$diff"

if [ "$fail" -ne 0 ]; then
  echo "check-leaks: найдены возможные утечки — уберите данные или добавьте в .gitignore." >&2
  echo "  Ложное срабатывание: пометьте строку 'leakcheck:allow'. Обход хука (git commit --no-verify) — только осознанно." >&2
  exit 1
fi
echo "check-leaks: чисто"
