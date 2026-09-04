# pnpm-конфиг профиля web. pnpm v11 читает overrides отсюда, а не из
# package.json (package.json.pnpm.overrides молча игнорируется с предупреждением).
#
# dsh-client-runtime: dsh-result-only-view объявляет на него голый peer '*',
# а dist-tag `latest` этого пакета на npm указывает на самую старую версию
# 0.0.1-rc.1, которая тянет несуществующий @deepseek-ai/dsh-compact (404) —
# без override установка профиля падает на этом шаге. 0.1.1-rc.2 — последняя
# опубликованная версия без этой сломанной зависимости.
overrides:
  '@deepseek-ai/dsh-client-runtime': '0.1.1-rc.2'

# Без этого установка падает на ERR_PNPM_IGNORED_BUILDS (native-аддоны вроде
# node-pty/koffi требуют approve-builds на каждой машине). Ставим только
# официальные @deepseek-ai/* пакеты через фиксированный пин.
dangerouslyAllowAllBuilds: true
