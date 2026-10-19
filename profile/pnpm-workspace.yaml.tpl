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

# dsh-result-only-view@1.6.4 против ядра 0.1.7: list-слот conversation.chat.turnTail
# регистрируется без id — фронтенд 0.1.7 бросает «list slot ... requires options.id»
# и роняет кусок UI. Патч добавляет id (копия в profile/patches/, применяется pnpm).
patchedDependencies:
  dsh-result-only-view@1.6.4: patches/dsh-result-only-view@1.6.4.patch

# dsh-plugin-subscriptions публикуется часто; свежий релиз моложе кута
# minimumReleaseAge — это ожидаемо для нашего пина, исключаем.
minimumReleaseAgeExclude:
  - dsh-plugin-subscriptions@0.9.6
