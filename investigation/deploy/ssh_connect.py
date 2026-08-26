"""Подключение к серверу платформы расследований.

Общий модуль для всех скриптов развёртывания. Раньше каждый скрипт подключался сам,
и это создавало ловушку в порядке действий: как только в секреты добавляли ключ,
вход шёл только по ключу — а пользователя развёртывания на сервере ещё не существовало.

Здесь порядок не важен: сначала пробуется ключ, при неудаче аутентификации —
пароль root, если он задан. Так добавление ключа безопасно в любой момент, а после
запуска harden-server.py парольный путь просто перестанет использоваться.
"""

import io
import os
import sys

import paramiko

DEFAULT_HOST = "188.116.23.111"


def _load_key(material: str):
    """Разбирает ключ. Поддерживаются ed25519 и RSA: формат зависит от того,
    чем владелец сгенерировал пару."""
    for key_class in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
        try:
            return key_class.from_private_key(io.StringIO(material))
        except Exception:
            continue
    raise ValueError(
        "не удалось разобрать SSH_PRIVATE_KEY: ожидается ed25519, RSA или ECDSA "
        "без парольной фразы"
    )


def connect(*, host: str | None = None, prefer_root: bool = False) -> paramiko.SSHClient:
    """Возвращает подключённого клиента.

    :param prefer_root: для операций, которым нужен root независимо от наличия ключа
                        (первичная установка пакетов, правка sshd).
    """
    host = host or os.environ.get("SSH_HOST", DEFAULT_HOST)
    private_key = os.environ.get("SSH_PRIVATE_KEY", "").strip()
    password = os.environ.get("SSH_PASSWORD", "").strip()
    user = os.environ.get("SSH_USER", "deploy")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    attempts = []
    if private_key and not prefer_root:
        attempts.append(("ключ", lambda: client.connect(
            host, username=user, pkey=_load_key(private_key), timeout=30,
            look_for_keys=False, allow_agent=False)))
    if password:
        attempts.append(("пароль root", lambda: client.connect(
            host, username="root", password=password, timeout=30)))
    if private_key and prefer_root:
        attempts.append(("ключ", lambda: client.connect(
            host, username=user, pkey=_load_key(private_key), timeout=30,
            look_for_keys=False, allow_agent=False)))

    if not attempts:
        print("ERROR: не задан ни SSH_PRIVATE_KEY, ни SSH_PASSWORD", file=sys.stderr)
        sys.exit(1)

    errors = []
    for label, attempt in attempts:
        try:
            attempt()
            print(f"подключение: {label}")
            return client
        except paramiko.AuthenticationException as error:
            # Отказ аутентификации — ожидаемая ситуация до перевода сервера на ключи:
            # пользователя развёртывания может ещё не быть.
            errors.append(f"{label}: {error}")
        except Exception as error:
            errors.append(f"{label}: {error}")

    print("ERROR: не удалось подключиться к серверу:", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)
    sys.exit(1)


def run(client, command, *, check=True, quiet=False, stdin_data=None):
    """Выполняет команду. Возвращает код, stdout и stderr.

    stdin_data передаётся команде стандартным вводом. Это единственный способ отдать
    секрет удалённой команде, не оставив его в списке процессов сервера и в истории
    оболочки: аргументы командной строки видны всем, кто на сервере есть.
    """
    stdin, stdout, stderr = client.exec_command(command)
    if stdin_data is not None:
        stdin.write(stdin_data)
        stdin.flush()
        stdin.channel.shutdown_write()
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
