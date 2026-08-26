#!/usr/bin/env python3
"""Настройка Caddy для платформы расследований.

Делает то, что иначе пришлось бы делать вручную по SSH: ставит Caddy, если его нет,
добавляет блок сайта, проверяет конфигурацию и перечитывает её.

Порядок безопасный: прежняя конфигурация сохраняется, новая проверяется `caddy validate`
до применения, а при неудачной проверке или недоступности сайта после перезапуска
изменения откатываются. Сломанный Caddy уронил бы и n8n, который живёт на этом же сервере.

Сертификат Let's Encrypt Caddy получает сам, поэтому запись DNS должна уже указывать
на сервер: без этого выпуск сертификата не пройдёт, и скрипт скажет об этом прямо.

Переменные окружения:
    SSH_HOST, SSH_PRIVATE_KEY или SSH_PASSWORD
    INVESTIGATION_DOMAIN   домен платформы
"""

import io
import os
import socket
import sys
import time

import paramiko

HOST = os.environ.get("SSH_HOST", "188.116.23.111")
DOMAIN = os.environ.get("INVESTIGATION_DOMAIN", "investigation.regattayg.space")
CADDYFILE = "/etc/caddy/Caddyfile"
BACKUP = "/etc/caddy/Caddyfile.before-investigation"
MARKER_BEGIN = "# >>> investigation platform (управляется investigation/deploy/setup-caddy.py)"
MARKER_END = "# <<< investigation platform"


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    private_key = os.environ.get("SSH_PRIVATE_KEY", "").strip()
    if private_key:
        key = paramiko.Ed25519Key.from_private_key(io.StringIO(private_key))
        client.connect(HOST, username=os.environ.get("SSH_USER", "deploy"), pkey=key,
                       timeout=30, look_for_keys=False, allow_agent=False)
        return client

    password = os.environ.get("SSH_PASSWORD", "")
    if not password:
        print("ERROR: не задан ни SSH_PRIVATE_KEY, ни SSH_PASSWORD", file=sys.stderr)
        sys.exit(1)
    client.connect(HOST, username="root", password=password, timeout=30)
    return client


def run(client, command, *, check=True, quiet=False):
    _, stdout, stderr = client.exec_command(command)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if not quiet and out.strip():
        print(out.strip())
    if code != 0 and check:
        if err.strip():
            print(err.strip(), file=sys.stderr)
        raise RuntimeError(f"команда завершилась с кодом {code}")
    return code, out, err


def site_block() -> str:
    """Блок сайта. Заголовки запрещают кеширование и встраивание материалов дела."""
    return f"""{MARKER_BEGIN}
{DOMAIN} {{
    encode gzip

    header {{
        Cache-Control "no-store"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        -Server
    }}

    reverse_proxy 127.0.0.1:8080 {{
        header_up X-Real-IP {{remote_host}}
    }}
}}
{MARKER_END}
"""


def strip_managed_block(content: str) -> str:
    """Убирает прежний блок платформы, не трогая остальные сайты в конфигурации."""
    lines = content.splitlines()
    result = []
    inside = False
    for line in lines:
        if line.strip() == MARKER_BEGIN:
            inside = True
            continue
        if inside and line.strip() == MARKER_END:
            inside = False
            continue
        if not inside:
            result.append(line)
    if inside:
        # Незакрытый блок означает повреждённую конфигурацию: лучше остановиться,
        # чем дописать второй сайт поверх обрывка первого.
        raise RuntimeError(
            "в Caddyfile найден незакрытый блок платформы: проверьте файл вручную"
        )
    return "\n".join(result)


def check_dns() -> bool:
    """Проверяет, что домен уже указывает на сервер."""
    try:
        resolved = {info[4][0] for info in socket.getaddrinfo(DOMAIN, None)}
    except socket.gaierror:
        print(f"ВНИМАНИЕ: домен {DOMAIN} не разрешается в адрес.")
        return False
    if HOST not in resolved:
        print(f"ВНИМАНИЕ: {DOMAIN} указывает на {', '.join(sorted(resolved))}, а не на {HOST}.")
        return False
    print(f"DNS в порядке: {DOMAIN} → {HOST}")
    return True


def main():
    dns_ok = check_dns()
    if not dns_ok:
        print()
        print("Сертификат Let's Encrypt не будет выпущен, пока запись DNS не указывает")
        print(f"на {HOST}. Добавьте A-запись и запустите этот шаг повторно.")
        sys.exit(1)

    client = connect()
    try:
        code, _, _ = run(client, "command -v caddy", check=False, quiet=True)
        if code != 0:
            print("ставлю Caddy")
            run(client, (
                "apt-get update -qq && apt-get install -y -qq debian-keyring debian-archive-keyring "
                "apt-transport-https curl gnupg"
            ))
            run(client, (
                "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' "
                "| gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
            ))
            run(client, (
                "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' "
                "> /etc/apt/sources.list.d/caddy-stable.list"
            ))
            run(client, "apt-get update -qq && apt-get install -y -qq caddy")
        else:
            print("Caddy уже установлен")

        run(client, f"mkdir -p /etc/caddy && touch {CADDYFILE}", quiet=True)
        run(client, f"test -f {BACKUP} || cp {CADDYFILE} {BACKUP}", quiet=True)

        # Конфигурация правится в Python, а не построчным sed по маркеру: на этом же
        # сервере в Caddyfile живёт n8n, и неверный диапазон удаления снёс бы чужой сайт.
        sftp = client.open_sftp()
        try:
            with sftp.file(CADDYFILE, "r") as handle:
                current = handle.read().decode("utf-8", "replace")

            candidate = strip_managed_block(current).rstrip() + "\n\n" + site_block()

            with sftp.file("/tmp/Caddyfile.candidate", "w") as handle:
                handle.write(candidate)
        finally:
            sftp.close()

        print("проверяю конфигурацию")
        code, _, err = run(client, "caddy validate --config /tmp/Caddyfile.candidate --adapter caddyfile",
                           check=False, quiet=True)
        if code != 0:
            raise RuntimeError(f"конфигурация Caddy некорректна, изменения не применены: {err.strip()}")

        run(client, f"cp /tmp/Caddyfile.candidate {CADDYFILE}", quiet=True)
        run(client, "systemctl enable --now caddy", check=False, quiet=True)
        code, _, err = run(client, "systemctl reload caddy", check=False, quiet=True)
        if code != 0:
            run(client, "systemctl restart caddy", check=False, quiet=True)

        print("жду выпуска сертификата")
        for attempt in range(20):
            time.sleep(6)
            code, out, _ = run(
                client,
                f"curl -sS --max-time 8 -o /dev/null -w '%{{http_code}}' https://{DOMAIN}/healthz",
                check=False, quiet=True,
            )
            status = out.strip()
            if code == 0 and status in {"200", "502", "503"}:
                # 502 и 503 означают, что TLS уже работает, а контейнер API ещё не развёрнут.
                print(f"домен отвечает по HTTPS (код {status})")
                break
        else:
            run(client, f"cp {BACKUP} {CADDYFILE}", check=False, quiet=True)
            run(client, "systemctl reload caddy", check=False, quiet=True)
            raise RuntimeError(
                f"домен {DOMAIN} не ответил по HTTPS: конфигурация откачена. "
                "Проверьте запись DNS и доступность портов 80 и 443."
            )

        print()
        print(f"готово: {DOMAIN} проксируется на 127.0.0.1:8080")
        print(f"резервная копия прежней конфигурации: {BACKUP}")
        print("Если API ещё не развёрнут, домен отвечает 502 — это ожидаемо до деплоя.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
