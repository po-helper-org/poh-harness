# Эксплуатация

## Запуск

```sh
./scripts/start-web.sh              # 127.0.0.1:3082
PORT=3090 ./scripts/start-web.sh    # другой порт
```

Ссылку с токеном печатает сам харнесс: `dsh web: http://127.0.0.1:3082/?token=…`.

Харнесс слушает только loopback. Токен в ссылке — это и есть аутентификация;
он меняется при каждом рестарте.

## Автозапуск при логине

### macOS (launchd)

```sh
sed "s|__REPO_ROOT__|$(pwd)|g" scripts/ru.poh.dsh-harness.plist.tmpl \
  > ~/Library/LaunchAgents/ru.poh.dsh-harness.plist
launchctl load -w ~/Library/LaunchAgents/ru.poh.dsh-harness.plist
```

Управление:

```sh
launchctl list | grep dsh-harness                                    # статус
launchctl unload ~/Library/LaunchAgents/ru.poh.dsh-harness.plist     # стоп
tail -5 /tmp/dsh-harness.log                                         # свежий токен
```

Перезапуск (например, после правки манифеста профиля) — `unload` + `load -w`.

### Linux (systemd --user)

```sh
mkdir -p ~/.config/systemd/user
sed "s|__REPO_ROOT__|$(pwd)|g" scripts/poh-harness.service.tpl \
  > ~/.config/systemd/user/poh-harness.service
systemctl --user daemon-reload
systemctl --user enable --now poh-harness.service
```

Управление:

```sh
systemctl --user status poh-harness.service      # статус
journalctl --user -u poh-harness.service -f      # свежий токен и логи
systemctl --user disable --now poh-harness.service  # стоп
```

На headless-сервере (без интерактивного входа) юнит не запустится до первого
логина без `loginctl enable-linger $USER`.

## Где что лежит

| Путь | Что |
|---|---|
| `node_modules/.bin/dsh` | CLI харнесса — обычная npm-зависимость (`@deepseek-ai/dsh`, см. `package.json`), не клон исходников. |
| `.dsh-data/` | Сессии, учётные данные подписки, профили. **Не в git.** |
| `.dsh-data/profiles/web/` | Манифест профиля и слои патчей — генерируются установщиком из `profile/*.tpl`. |
| `plugins/dsh-plugin-bft/` | Исходники раздела «Управление требованиями» (git subtree из ishmanov-cortex). |
| `plugins/dsh-plugin-caveman/` | Опциональный стиль ответов (`--with-caveman`). |
| `skills/` | Submodule'ы скиллов po-helper-org (`poh-bft-writer`, `poh-okr-agent`, `poh-helper`). |
| `workspace/` | Демо-воркспейс по умолчанию (задачи БФТ, документы, минимальный GROUND). |
| `profile/*.tpl` | Источник истины по профилю. Правьте здесь, а не в `.dsh-data`. |
| `config/*.cordis.yml` | Референсные конфиги подключений с обоснованиями (перенесены в `profile/cordis.patch.yml.tpl`). |

## Что после чего перезапускать

| Изменили | Что сделать |
|---|---|
| Код плагина (`plugins/dsh-plugin-bft/src/`) | `pnpm build` в каталоге плагина + перезагрузить страницу |
| `profile/*.tpl` | `./install.sh --skip-build` + рестарт харнесса |
| Состав плагинов профиля | `./install.sh --skip-build` + рестарт харнесса |
| Скиллы в submodule'ах (`skills/*`) | `git submodule update --remote` + рестарт харнесса |
| Скиллы в воркспейсе (`<воркспейс>/.claude/skills`) | Рестарт харнесса |

Правки в `.dsh-data/profiles/web/` руками переживут рестарт, но **не переживут
следующий `install.sh`** — он перезапишет файлы из шаблонов (старое положит
рядом как `*.bak-<timestamp>`). Поэтому правьте `profile/*.tpl`.

## Обновление

Слой контура:

```sh
git pull
git submodule update --init --recursive
./install.sh --skip-build
```

Версия харнесса закреплена в `install.sh` (`HARNESS_VERSION`) — dist-tag
`alpha` пакета `@deepseek-ai/dsh` на npm, на котором контур собран и проверен.
Поднимать её стоит осознанно: API плагинов у харнесса ещё alpha и меняется
между версиями, а раздел требований завязан на слоты `sidebar.footer.action`
и `shell.overlay`. Обновление — отдельная задача: поднять пин, пересобрать
`plugins/dsh-plugin-bft` против новых `devDependencies`, прогнать
`install.sh --check` на чистой машине.
