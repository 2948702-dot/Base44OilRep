#!/usr/bin/env python3
"""Деплой платформы расследований на VPS.

Повторяет проверенный на этом сервере приём из regatta-voice-pipeline: копирование по
SFTP, .env с правами 0600, пересборка и перезапуск контейнера. Токены нигде не
печатаются — в журнал GitHub Actions уходят только имена переменных.

Отличие от деплоя ботов: перед перезапуском API применяются миграции схемы, и запуск
считается неуспешным, если контейнер не отвечает на /healthz.

Доступ: предпочитается вход по ключу под пользователем развёртывания. Пароль root
остаётся резервным вариантом до перевода сервера на ключи
(investigation/deploy/harden-server.py).

Переменные окружения:
    SSH_HOST              адрес сервера
    SSH_PRIVATE_KEY       закрытый ключ пользователя развёртывания (предпочтительно)
    SSH_USER              пользователь развёртывания, по умолчанию deploy
    SSH_PASSWORD          пароль root (резервный вариант)
    POSTGRES_PASSWORD     пароль роли приложения
    ANTHROPIC_API_KEY     ключ модели
"""

import io
import os
import posixpath
import sys
import time

import paramiko

HOST = os.environ.get("SSH_HOST", "188.116.23.111")
PASSWORD = os.environ.get("SSH_PASSWORD", "")
REMOTE_DIR = "/opt/investigation"
CONTAINER = "investigation-api"
IMAGE = "investigation-api:latest"
DB_CONTAINER = "investigation-db"
NETWORK = "investigation-net"
FILE_VOLUME = "investigation-sources"
DB_VOLUME = "investigation-pgdata"

PAYLOAD = [
    "package.json",
    "package-lock.json",
    "src/investigation",
    "investigation/db",
    "investigation/tools",
    "investigation/deploy/Dockerfile",
]

REQUIRED_SECRETS = ["POSTGRES_PASSWORD", "ANTHROPIC_API_KEY"]


def build_env_file() -> str:
    values = {name: os.environ.get(name, "").strip() for name in REQUIRED_SECRETS}
    missing = [name for name, value in values.items() if not value]
    if missing:
        print(f"ERROR: не заданы секреты: {', '.join(missing)}", file=sys.stderr)
        print("Добавьте их в Settings -> Secrets and variables -> Actions", file=sys.stderr)
        sys.exit(1)

    password = values["POSTGRES_PASSWORD"]
    lines = {
        "DATABASE_URL": f"postgres://investigation_app:{password}@{DB_CONTAINER}:5432/investigation",
        "ANTHROPIC_API_KEY": values["ANTHROPIC_API_KEY"],
        "INVESTIGATION_FILE_ROOT": "/var/lib/investigation/sources",
        "NODE_ENV": "production",
        "PORT": "8080",
        "TZ": os.environ.get("TZ", "Europe/Moscow"),
    }
    return "".join(f"{name}={value}\n" for name, value in lines.items())


def connect() -> paramiko.SSHClient:
    """Вход по ключу, если он задан; иначе резервный вход root по паролю."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    private_key = os.environ.get("SSH_PRIVATE_KEY", "").strip()
    if private_key:
        key = paramiko.Ed25519Key.from_private_key(io.StringIO(private_key))
        client.connect(HOST, username=os.environ.get("SSH_USER", "deploy"), pkey=key,
                       timeout=30, look_for_keys=False, allow_agent=False)
        print("вход по ключу")
        return client

    if not PASSWORD:
        print("ERROR: не задан ни SSH_PRIVATE_KEY, ни SSH_PASSWORD", file=sys.stderr)
        sys.exit(1)
    client.connect(HOST, username="root", password=PASSWORD, timeout=30)
    print("вход по паролю root (резервный вариант; переведите сервер на ключи)")
    return client


def run(client, command, *, check=True, quiet=False):
    _, stdout, stderr = client.exec_command(command)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if not quiet and out.strip():
        print(out.strip())
    if code != 0:
        if err.strip():
            print(err.strip(), file=sys.stderr)
        if check:
            raise RuntimeError(f"команда завершилась с кодом {code}: {command.split()[0]}")
    return code, out, err


def upload(sftp, local, remote):
    if os.path.isdir(local):
        try:
            sftp.mkdir(remote)
        except OSError:
            pass
        for name in os.listdir(local):
            if name in {"node_modules", "__pycache__", ".git"}:
                continue
            upload(sftp, os.path.join(local, name), posixpath.join(remote, name))
    else:
        sftp.put(local, remote)


def ensure_database(client):
    """Поднимает Postgres с pgvector, если его ещё нет. Данные живут на томе."""
    code, out, _ = run(client, f"docker ps -a --filter name=^{DB_CONTAINER}$ --format '{{{{.Names}}}}'",
                       check=False, quiet=True)
    if DB_CONTAINER in out:
        run(client, f"docker start {DB_CONTAINER}", check=False, quiet=True)
        return

    password = os.environ["POSTGRES_PASSWORD"]
    run(client, f"docker network create {NETWORK}", check=False, quiet=True)
    run(client, f"docker volume create {DB_VOLUME}", quiet=True)
    # Порт наружу не публикуется: база доступна только внутри сети контейнеров.
    run(client, (
        f"docker run -d --name {DB_CONTAINER} --restart unless-stopped "
        f"--network {NETWORK} "
        f"-e POSTGRES_DB=investigation "
        f"-e POSTGRES_USER=postgres "
        f"-e POSTGRES_PASSWORD={password} "
        f"-v {DB_VOLUME}:/var/lib/postgresql/data "
        f"pgvector/pgvector:pg16"
    ))
    time.sleep(10)

    # Роль приложения создаётся БЕЗ bypassrls: на этом держится изоляция арендаторов.
    run(client, (
        f"docker exec {DB_CONTAINER} psql -U postgres -d investigation -c "
        f"\"do \\$\\$ begin if not exists (select from pg_roles where rolname='investigation_app') "
        f"then create role investigation_app login password '{password}' nobypassrls; end if; end \\$\\$;\""
    ))


def main():
    env_file = build_env_file()
    client = connect()

    try:
        run(client, f"mkdir -p {REMOTE_DIR}")
        run(client, f"rm -rf {REMOTE_DIR}/src {REMOTE_DIR}/investigation", check=False, quiet=True)

        sftp = client.open_sftp()
        try:
            for item in PAYLOAD:
                remote = posixpath.join(REMOTE_DIR, item)
                parent = posixpath.dirname(remote)
                run(client, f"mkdir -p {parent}", quiet=True)
                upload(sftp, item, remote)

            env_path = posixpath.join(REMOTE_DIR, ".env")
            with sftp.file(env_path, "w") as handle:
                handle.write(env_file)
            sftp.chmod(env_path, 0o600)
            print("записан .env:", ", ".join(line.split("=")[0] for line in env_file.strip().split("\n")))
        finally:
            sftp.close()

        ensure_database(client)

        run(client, f"docker volume create {FILE_VOLUME}", quiet=True)
        run(client, f"cd {REMOTE_DIR} && docker build -f investigation/deploy/Dockerfile -t {IMAGE} .")

        # Миграции применяются до перезапуска: новый код не должен встретить старую схему.
        # Миграции выполняются под администратором базы: роль приложения не владеет
        # схемой и не должна иметь права её менять.
        admin_url = (
            f"postgres://postgres:{os.environ['POSTGRES_PASSWORD']}@{DB_CONTAINER}:5432/investigation"
        )
        run(client, (
            f"docker run --rm --network {NETWORK} "
            f"-e DATABASE_URL='{admin_url}' -e APP_DB_ROLE=investigation_app {IMAGE} "
            f"node investigation/tools/migrate.mjs"
        ))

        run(client, f"docker rm -f {CONTAINER}", check=False, quiet=True)
        run(client, (
            f"docker run -d --name {CONTAINER} --restart unless-stopped "
            f"--network {NETWORK} "
            f"--env-file {REMOTE_DIR}/.env "
            f"-v {FILE_VOLUME}:/var/lib/investigation/sources "
            f"-p 127.0.0.1:8080:8080 "
            f"{IMAGE}"
        ))

        for attempt in range(15):
            time.sleep(3)
            code, out, _ = run(client, "curl -sS --max-time 5 http://127.0.0.1:8080/healthz",
                               check=False, quiet=True)
            if code == 0 and '"status":"ok"' in out:
                print("контейнер отвечает:", out.strip())
                break
        else:
            run(client, f"docker logs --tail 50 {CONTAINER}", check=False)
            raise RuntimeError("контейнер не ответил на /healthz")

        print("деплой завершён")
    finally:
        client.close()


if __name__ == "__main__":
    main()
