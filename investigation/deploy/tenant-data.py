#!/usr/bin/env python3
"""Выгрузка и удаление данных арендатора на развёрнутом сервере (§60 ТЗ).

Продажа внешним клиентам делает обе процедуры обязательными: организация вправе
забрать свои материалы и вправе потребовать их удаления.

Архив выгрузки остаётся на сервере и по сети сюда не передаётся. Это сделано
намеренно: журнал GitHub Actions и артефакты сборки — не место для материалов
внутренних расследований чужой организации. Скрипт печатает путь и контрольную
сумму; забрать файл владелец должен сам, по SSH.

Переменные окружения:
    SSH_HOST, SSH_PRIVATE_KEY или SSH_PASSWORD
    ACTION            export | delete | list
    POSTGRES_PASSWORD для delete: пароль владельца базы
    ORG_SLUG          какой арендатор
    CONFIRM_SLUG      для delete: тот же slug ещё раз
    REASON            для delete: основание
    REQUESTED_BY      для delete: кто потребовал
"""

import os
import shlex
import sys

from ssh_connect import connect, run, write_remote_file

REMOTE_DIR = "/opt/investigation"
NETWORK = "investigation-net"
IMAGE = "investigation-api:latest"
EXPORT_DIR = "/opt/investigation/exports"


ADMIN_ENV = "/opt/investigation/.tenant-admin.env"


def docker(command: str, *, admin: bool = False) -> str:
    extra = f"--env-file {ADMIN_ENV} " if admin else ""
    return (
        f"cd {REMOTE_DIR} && docker run --rm --network {NETWORK} "
        f"--env-file {REMOTE_DIR}/.env {extra}"
        f"-v {EXPORT_DIR}:{EXPORT_DIR} "
        f"-v investigation-files:/var/lib/investigation/sources "
        f"{IMAGE} node investigation/tools/tenant-data.mjs {command}"
    )


def main():
    action = os.environ.get("ACTION", "list").strip()
    slug = os.environ.get("ORG_SLUG", "").strip()

    client = connect()
    try:
        if action == "list":
            run(client, docker("--list"))
            return

        if not slug:
            print("ERROR: не задан ORG_SLUG", file=sys.stderr)
            sys.exit(1)

        if action == "export":
            run(client, f"mkdir -p {EXPORT_DIR} && chmod 700 {EXPORT_DIR}")
            target = f"{EXPORT_DIR}/{slug}-export.zip"
            run(client, docker(f"--export --slug {shlex.quote(slug)} --out {shlex.quote(target)}"))
            print("")
            print("Архив остался на сервере и по сети не передавался.")
            print(f"Забрать его: scp <пользователь>@<сервер>:{target} .")
            print("Передавая архив клиенту, приложите контрольную сумму из вывода выше.")
            return

        if action == "delete":
            confirm = os.environ.get("CONFIRM_SLUG", "").strip()
            reason = os.environ.get("REASON", "").strip()
            requested_by = os.environ.get("REQUESTED_BY", "").strip()

            missing = [
                name for name, value in
                (("CONFIRM_SLUG", confirm), ("REASON", reason), ("REQUESTED_BY", requested_by))
                if not value
            ]
            if missing:
                print(f"ERROR: не заданы: {', '.join(missing)}", file=sys.stderr)
                sys.exit(1)

            # Подтверждение сверяется и здесь, до обращения к серверу: ошибиться
            # в этом действии нельзя, а отменить его нечем.
            if confirm != slug:
                print(
                    "ERROR: подтверждение не совпадает с идентификатором организации. "
                    "Удаление данных арендатора необратимо.",
                    file=sys.stderr,
                )
                sys.exit(1)

            # Журналы стирает только владелец таблиц: роль приложения этого не может,
            # даже выставив флаг стирания. Строка подключения владельца передаётся
            # временным env-файлом с правами 600, а не аргументом команды.
            postgres_password = os.environ.get("POSTGRES_PASSWORD", "").strip()
            if not postgres_password:
                print("ERROR: не задан POSTGRES_PASSWORD", file=sys.stderr)
                sys.exit(1)

            admin_url = (
                f"postgres://postgres:{postgres_password}@investigation-db:5432/investigation"
            )
            write_remote_file(client, ADMIN_ENV, f"ADMIN_DATABASE_URL={admin_url}\n")
            try:
                run(client, docker(
                    f"--delete --slug {shlex.quote(slug)} --confirm {shlex.quote(confirm)} "
                    f"--reason {shlex.quote(reason)} --requested-by {shlex.quote(requested_by)}",
                    admin=True,
                ))
            finally:
                run(client, f"rm -f {ADMIN_ENV}", check=False, quiet=True)
            print("")
            print("Выгрузку, сделанную перед удалением, храните отдельно: восстановить")
            print("данные из системы больше нельзя.")
            return

        print(f"ERROR: неизвестное действие {action}", file=sys.stderr)
        sys.exit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
