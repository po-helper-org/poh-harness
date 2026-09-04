# Caveman ultra как стиль ответа по умолчанию во всех чатах DSH, через
# плагин plugins/dsh-plugin-caveman. Подключается только с ./install.sh
# --with-caveman — по умолчанию контур не меняет стиль ответов модели.
#
# Стиль адаптирован из плагина caveman для Claude Code
# (https://github.com/JuliusBrussee/caveman).
#
# ПОЧЕМУ СЕКЦИЯ, А НЕ ПЕРСОНА
#
# Каждый поставляемый пресет агента (`standard`, `ptc`, `cordis`) монтирует
# собственную строку `@deepseek-ai/dsh-persona`, которая регистрирует секцию
# `deployment:persona` и ЗАТЕНЯЕТ персону, заданную на host-строке
# `system-prompt`. Патч `system-prompt.persona` в profile patch поэтому молча
# инертен — проверьте на `dsh --profile web --dump-config`.
#
# Секция под ДРУГИМ именем (`style:caveman`) попадает в глобальный слой
# реестра, а `dsh-system-prompt` мержит глобальный слой в scope каждого агента.
# Один host-ряд покрывает все пресеты, и ни одну композицию пресета форкать
# не нужно.
#
# Порядок 10 ставит стиль сразу после персоны (0) и до `PLAN_POLICY` (500) и
# блоков подсказок по инструментам (>= 1000).
- insert:
    - id: caveman-style
      name: '__REPO_ROOT__/plugins/dsh-plugin-caveman/lib/index.js'
      config:
        # lite | full | ultra. ultra дополнительно срезает союзы там, где
        # причина и следствие остаются однозначными.
        level: ultra
        # Код, коммиты, PR-описания, security-предупреждения, подтверждения
        # необратимых операций и многошаговые инструкции остаются обычной прозой.
        preserveCodeStyle: true
