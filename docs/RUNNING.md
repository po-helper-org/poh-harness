# Эксплуатация

## Запуск

```sh
./scripts/start-web.sh              # 127.0.0.1:3082
PORT=3090 ./scripts/start-web.sh    # другой порт
```

Ссылку с токеном печатает сам харнесс: `dsh web: http://127.0.0.1:3082/?token=…`.

Харнесс слушает только loopback. Токен в ссылке — это и есть аутентификация;
он меняется при каждом рестарте.

## Автозапуск при логине (macOS)

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

## Где что лежит

| Путь | Что |
|---|---|
| `harness/` | Апстрим-харнесс на закреплённой версии. В git этого репозитория не попадает. |
| `harness/.dsh-data/` | Сессии, учётные данные подписки, профили. **Не в git.** |
| `harness/.dsh-data/profiles/web/` | Манифест профиля и слой патчей — генерируются установщиком из `profile/*.tmpl`. |
| `plugins/dsh-plugin-bft/` | Исходники раздела «Управление требованиями». |
| `profile/*.tmpl` | Источник истины по профилю. Правьте здесь, а не в `.dsh-data`. |
| `config/*.cordis.yml` | Референсные конфиги подключений с обоснованиями. |

## Что после чего перезапускать

| Изменили | Что сделать |
|---|---|
| Код плагина (`plugins/dsh-plugin-bft/src/`) | `pnpm build` в каталоге плагина + перезагрузить страницу |
| `profile/*.tmpl` | `./install.sh --skip-build` + рестарт харнесса |
| Состав плагинов профиля | `./install.sh --skip-build` + рестарт харнесса |
| Скиллы в воркспейсе | Рестарт харнесса |

Правки в `harness/.dsh-data/profiles/web/` руками переживут рестарт, но
**не переживут следующий `install.sh`** — он перезапишет файлы из шаблонов
(старое положит рядом как `*.bak`). Поэтому правьте `profile/*.tmpl`.

## Обновление

Слой контура:

```sh
git pull
./install.sh --skip-build
```

Апстрим-харнесс закреплён в `install.sh` (`HARNESS_PIN`) — версия, на которой
контур собран и проверен. Поднимать её стоит осознанно: API плагинов у харнесса
ещё alpha и меняется между версиями, а раздел требований завязан на слоты
`sidebar.footer.action` и `shell.overlay`.
