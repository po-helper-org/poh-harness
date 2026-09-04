# Автозапуск харнесса при логине (Linux, systemd --user). Необязательно:
# контур прекрасно работает и от руки через ./scripts/start-web.sh.
#
# Установка:
#   mkdir -p ~/.config/systemd/user
#   sed "s|__REPO_ROOT__|$(pwd)|g" scripts/poh-harness.service.tpl \
#     > ~/.config/systemd/user/poh-harness.service
#   systemctl --user daemon-reload
#   systemctl --user enable --now poh-harness.service
#
# Статус / логи:
#   systemctl --user status poh-harness.service
#   journalctl --user -u poh-harness.service -f
#
# Снятие:
#   systemctl --user disable --now poh-harness.service
#
# Автозапуск при логине без активной сессии пользователя (headless-сервер)
# требует `loginctl enable-linger $USER` — иначе systemd --user юнит не
# стартует до первого интерактивного входа.
[Unit]
Description=poh-harness (DeepSeek Harness web profile)
After=network.target

[Service]
Type=simple
WorkingDirectory=__REPO_ROOT__
ExecStart=__REPO_ROOT__/scripts/start-web.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
