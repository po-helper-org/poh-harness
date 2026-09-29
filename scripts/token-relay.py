#!/usr/bin/env python3
"""Token-relay для poh-harness dsh web (публичный вход за TOTP-гейтом).

dsh web при старте печатает launch-токен процесса:
    dsh web: http://127.0.0.1:3082/?token=XXXX

Токен нужен браузеру один раз: GET /?token=... отдаёт подписанную cookie
(дальше приложение живёт на ней; секрет подписи персистентен в .dsh-data,
поэтому рестарты dsh cookie не инвалидируют).

Этот сервис:
  1. Раз в POLL_SECONDS читает свежий launch-токен из
     journalctl --user -u poh-harness.service (последняя строка `token=`).
  2. Отдаёт GET /start → 302 /?token=<текущий> для nginx-vhost'а dsh.
     Location относительный — работает за любым Host.

Слушает только 127.0.0.1:3083; наружу его выставляет nginx (location = /start)
ПОСЛЕ auth_request TOTP-гейта — токен публично не виден.
Если токена ещё нет (dsh не стартовал) — 503, nginx покажет стандартную ошибку.
"""

import http.server
import re
import subprocess
import threading
import time

JOURNAL_UNIT = "poh-harness.service"
LISTEN = ("127.0.0.1", 3083)
POLL_SECONDS = 10
TOKEN_RE = re.compile(r"token=([A-Za-z0-9_-]+)")

_current_token: str | None = None
_lock = threading.Lock()


def log(msg: str) -> None:
    print(f"[token-relay] {msg}", flush=True)


def read_token_from_journal() -> str | None:
    try:
        out = subprocess.run(
            ["journalctl", "--user", "-u", JOURNAL_UNIT, "-n", "300", "--no-pager", "-o", "cat"],
            capture_output=True, text=True, timeout=15,
        ).stdout
    except Exception as exc:
        log(f"journalctl error: {exc}")
        return None
    tokens = TOKEN_RE.findall(out)
    return tokens[-1] if tokens else None


def poller() -> None:
    global _current_token
    seen: str | None = None
    while True:
        token = read_token_from_journal()
        if token and token != seen:
            seen = token
            with _lock:
                _current_token = token
            log(f"launch token updated (…{token[-6:]})")
        time.sleep(POLL_SECONDS)


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        if self.path.split("?")[0] != "/start":
            self.send_response(404)
            self.end_headers()
            return
        with _lock:
            token = _current_token
        if not token:
            body = b"dsh launch token not available yet\n"
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(302)
        self.send_header("Location", f"/?token={token}")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        log(f"{self.address_string()} {format % args}")


def main() -> None:
    threading.Thread(target=poller, daemon=True).start()
    log(f"listening on {LISTEN[0]}:{LISTEN[1]}")
    http.server.ThreadingHTTPServer(LISTEN, Handler).serve_forever()


if __name__ == "__main__":
    main()
