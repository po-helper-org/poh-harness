# Token-relay для доступа к харнессу с телефона/извне (Linux, systemd --user).
# Нужен, только если dsh web выставлен наружу через reverse-proxy с собственной
# авторизацией (например, nginx + TOTP-гейт): relay отдаёт GET /start → 302
# на свежую launch-ссылку dsh, чтобы после рестарта не искать токен в логах.
# Слушает только 127.0.0.1:3083; наружу — через proxy ПОСЛЕ его авторизации,
# иначе ссылка с токеном станет публичной. Подробности — в scripts/token-relay.py.
#
# Установка (poh-harness.service уже стоит, см. docs/RUNNING.md):
#   sed "s|__REPO_ROOT__|$(pwd)|g" scripts/dsh-token-relay.service.tpl \
#     > ~/.config/systemd/user/dsh-token-relay.service
#   systemctl --user daemon-reload
#   systemctl --user enable --now dsh-token-relay.service
#
# Юнит привязан к poh-harness.service (BindsTo): перезапускается и
# останавливается вместе с харнессом.
[Unit]
Description=poh-harness dsh token-relay (cookie keeper)
After=poh-harness.service
BindsTo=poh-harness.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 __REPO_ROOT__/scripts/token-relay.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
