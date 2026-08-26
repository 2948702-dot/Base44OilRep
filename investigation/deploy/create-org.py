#!/usr/bin/env python3
"""Создание организации и первого пользователя на развёрнутом сервере.

Без этого шага в систему нечем войти: платформа не создаёт учётных записей сама,
а самостоятельная регистрация в продукте для внутренних расследований недопустима —
доступ к материалам выдаёт владелец организации, а не форма регистрации.

Пароль передаётся секретом и нигде не печатается: ни в вывод, ни в журнал Actions.
В базе остаётся только scrypt-хэш.

Переменные окружения:
    SSH_HOST, SSH_PRIVATE_KEY или SSH_PASSWORD
    ORG_NAME, ORG_SLUG, OWNER_EMAIL, OWNER_FULL_NAME
    OWNER_PASSWORD
"""

import os
import shlex
import sys

from ssh_connect import connect, run

REMOTE_DIR = "/opt/investigation"
NETWORK = "investigation-net"
IMAGE = "investigation-api:latest"


def main():
    required = {
        "ORG_NAME": os.environ.get("ORG_NAME", "").strip(),
        "ORG_SLUG": os.environ.get("ORG_SLUG", "").strip(),
        "OWNER_EMAIL": os.environ.get("OWNER_EMAIL", "").strip(),
        "OWNER_PASSWORD": os.environ.get("OWNER_PASSWORD", "").strip(),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        print(f"ERROR: не заданы: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    if len(required["OWNER_PASSWORD"]) < 12:
        print("ERROR: пароль короче 12 символов не принимается", file=sys.stderr)
        sys.exit(1)

    full_name = os.environ.get("OWNER_FULL_NAME", "").strip() or required["OWNER_EMAIL"]

    client = connect()
    try:
        # Пароль передаётся стандартным вводом контейнера. Прежде он уходил
        # аргументом `docker run -e ...`, а аргументы видны в `ps aux` любому,
        # кто есть на сервере: комментарий обещал обратное, а строка делала ровно
        # то, от чего обещал защитить.
        command = (
            f"cd {REMOTE_DIR} && docker run --rm -i --network {NETWORK} "
            f"--env-file {REMOTE_DIR}/.env "
            f"{IMAGE} node investigation/tools/bootstrap-org.mjs "
            f"--name {shlex.quote(required['ORG_NAME'])} "
            f"--slug {shlex.quote(required['ORG_SLUG'])} "
            f"--email {shlex.quote(required['OWNER_EMAIL'])} "
            f"--full-name {shlex.quote(full_name)} "
            f"--role org_owner --password-stdin"
        )

        code, out, err = run(
            client, command, check=False, quiet=True,
            stdin_data=required["OWNER_PASSWORD"] + "\n",
        )

        # Вывод печатается вручную и после проверки: в нём не должно быть пароля,
        # но полагаться на это без фильтра нельзя.
        safe = out.replace(required["OWNER_PASSWORD"], "***")
        safe_err = err.replace(required["OWNER_PASSWORD"], "***")

        if code != 0:
            print(safe.strip())
            print(safe_err.strip(), file=sys.stderr)
            if "duplicate key" in err or "unique" in err.lower():
                print(
                    "\nОрганизация с таким slug или пользователь с таким адресом уже существует.",
                    file=sys.stderr,
                )
            sys.exit(1)

        print(safe.strip())
        print()
        print("Готово. Вход:")
        print(f"  адрес: {required['OWNER_EMAIL']}")
        print("  пароль: тот, что задан секретом OWNER_PASSWORD")
        print("Смените пароль после первого входа: механизм смены появится вместе с")
        print("экраном управления пользователями, пока смена делается повторным запуском")
        print("этого Action с новым паролем и другим адресом.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
