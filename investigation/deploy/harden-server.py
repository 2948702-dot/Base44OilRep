#!/usr/bin/env python3
"""Укрепление доступа к серверу платформы расследований.

Сейчас развёртывание идёт под root по паролю. Для ботов это терпимо, для сервера
с материалами внутренних расследований — нет: утечка одного секрета даёт полный
контроль над всеми делами всех клиентов.

Что делает скрипт:
    1. Создаёт пользователя развёртывания и добавляет его в группу docker.
    2. Устанавливает открытый ключ.
    3. ПРОВЕРЯЕТ вход по ключу отдельным соединением.
    4. Только после успешной проверки отключает парольную аутентификацию и вход root.
    5. Перезапускает sshd и ещё раз проверяет вход по ключу.

Порядок важен: отключение пароля до проверки ключа отрезает доступ к серверу
безвозвратно. Любой сбой на шагах 3–5 откатывает конфигурацию sshd.

Переменные окружения:
    SSH_HOST
    SSH_PASSWORD             текущий пароль root
    DEPLOY_SSH_PUBLIC_KEY    открытый ключ (ssh-ed25519 ...)
    DEPLOY_SSH_PRIVATE_KEY   закрытый ключ, только для проверки входа
    DEPLOY_USER              имя пользователя, по умолчанию deploy
"""

import io
import os
import sys
import time

import paramiko

HOST = os.environ.get("SSH_HOST", "188.116.23.111")
PASSWORD = os.environ.get("SSH_PASSWORD", "")
PUBLIC_KEY = os.environ.get("DEPLOY_SSH_PUBLIC_KEY", "").strip()
PRIVATE_KEY = os.environ.get("DEPLOY_SSH_PRIVATE_KEY", "").strip()
USER = os.environ.get("DEPLOY_USER", "deploy")

SSHD_CONFIG = "/etc/ssh/sshd_config"
BACKUP_CONFIG = "/etc/ssh/sshd_config.before-hardening"


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
        raise RuntimeError(f"команда завершилась с кодом {code}: {command.split()[0]}")
    return code, out, err


def verify_key_login() -> bool:
    """Отдельное соединение под пользователем развёртывания с закрытым ключом."""
    probe = paramiko.SSHClient()
    probe.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        key = paramiko.Ed25519Key.from_private_key(io.StringIO(PRIVATE_KEY))
        probe.connect(HOST, username=USER, pkey=key, timeout=20, look_for_keys=False,
                      allow_agent=False)
        _, stdout, _ = probe.exec_command("id -un && docker ps >/dev/null && echo docker-ok")
        output = stdout.read().decode("utf-8", "replace")
        return USER in output and "docker-ok" in output
    except Exception as error:
        print(f"проверка входа по ключу не удалась: {error}", file=sys.stderr)
        return False
    finally:
        probe.close()


def main():
    missing = [name for name, value in (
        ("SSH_PASSWORD", PASSWORD),
        ("DEPLOY_SSH_PUBLIC_KEY", PUBLIC_KEY),
        ("DEPLOY_SSH_PRIVATE_KEY", PRIVATE_KEY),
    ) if not value]
    if missing:
        print(f"ERROR: не заданы секреты: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    if not PUBLIC_KEY.startswith("ssh-ed25519"):
        print("ERROR: ожидается ключ ssh-ed25519", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=30)

    try:
        print(f"создаю пользователя {USER}")
        run(client, f"id -u {USER} >/dev/null 2>&1 || useradd -m -s /bin/bash {USER}")
        run(client, f"getent group docker >/dev/null && usermod -aG docker {USER}", check=False)
        run(client, f"install -d -m 700 -o {USER} -g {USER} /home/{USER}/.ssh")

        print("устанавливаю открытый ключ")
        run(client, (
            f"touch /home/{USER}/.ssh/authorized_keys && "
            f"grep -qxF '{PUBLIC_KEY}' /home/{USER}/.ssh/authorized_keys || "
            f"echo '{PUBLIC_KEY}' >> /home/{USER}/.ssh/authorized_keys"
        ))
        run(client, (
            f"chmod 600 /home/{USER}/.ssh/authorized_keys && "
            f"chown {USER}:{USER} /home/{USER}/.ssh/authorized_keys"
        ))

        # Каталоги платформы должны быть доступны пользователю развёртывания,
        # иначе следующий деплой упрётся в права.
        run(client, f"chown -R {USER}:{USER} /opt/investigation", check=False, quiet=True)

        print("проверяю вход по ключу ДО отключения пароля")
        if not verify_key_login():
            raise RuntimeError(
                "вход по ключу не работает — парольная аутентификация НЕ отключена. "
                "Проверьте пару ключей и повторите."
            )
        print("вход по ключу работает")

        print("сохраняю текущую конфигурацию sshd")
        run(client, f"test -f {BACKUP_CONFIG} || cp {SSHD_CONFIG} {BACKUP_CONFIG}")

        print("отключаю парольную аутентификацию и вход root")
        run(client, (
            f"sed -i -E 's/^#?\\s*PasswordAuthentication.*/PasswordAuthentication no/; "
            f"s/^#?\\s*PermitRootLogin.*/PermitRootLogin prohibit-password/; "
            f"s/^#?\\s*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/; "
            f"s/^#?\\s*KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' {SSHD_CONFIG}"
        ))
        # Директивы из включаемых файлов могут переопределить основной конфиг,
        # поэтому итог закрепляется отдельным файлом с наибольшим приоритетом.
        run(client, (
            "printf 'PasswordAuthentication no\\nPermitRootLogin prohibit-password\\n' "
            "> /etc/ssh/sshd_config.d/00-investigation-hardening.conf"
        ), check=False)

        code, _, err = run(client, "sshd -t", check=False, quiet=True)
        if code != 0:
            run(client, f"cp {BACKUP_CONFIG} {SSHD_CONFIG}")
            run(client, "rm -f /etc/ssh/sshd_config.d/00-investigation-hardening.conf", check=False)
            raise RuntimeError(f"конфигурация sshd некорректна, изменения откачены: {err.strip()}")

        run(client, "systemctl reload sshd || systemctl reload ssh", check=False)
        time.sleep(3)

        print("проверяю вход по ключу ПОСЛЕ изменения конфигурации")
        if not verify_key_login():
            run(client, f"cp {BACKUP_CONFIG} {SSHD_CONFIG}")
            run(client, "rm -f /etc/ssh/sshd_config.d/00-investigation-hardening.conf", check=False)
            run(client, "systemctl reload sshd || systemctl reload ssh", check=False)
            raise RuntimeError("вход по ключу перестал работать — конфигурация откачена")

        print()
        print("готово: доступ на сервер только по ключу, вход root по паролю закрыт")
        print("дальнейшие шаги владельца:")
        print("  1. Заменить в Actions использование N8N_SSH_ROOT_PASSWORD на DEPLOY_SSH_PRIVATE_KEY")
        print("     для рабочих процессов платформы расследований.")
        print("  2. Сменить пароль root: он больше не нужен для входа, но остаётся в секретах.")
        print(f"  3. Резервная копия прежней конфигурации: {BACKUP_CONFIG}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
