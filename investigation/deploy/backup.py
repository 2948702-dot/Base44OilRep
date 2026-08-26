#!/usr/bin/env python3
"""Резервное копирование платформы расследований.

База стала единственным носителем расследований, поэтому копия без проверки
восстановления бесполезна: повреждённый дамп выглядит как успешная резервная копия
ровно до того дня, когда он понадобится.

Что делает скрипт:
    1. Снимает дамп базы в custom-формате внутри контейнера.
    2. Восстанавливает дамп во временную базу и сверяет состав таблиц и число строк
       по ключевым сущностям. Копия, не прошедшая восстановление, удаляется, а запуск
       считается неуспешным.
    3. Архивирует том с оригиналами источников.
    4. Ротирует: оставляет последние 7 ежедневных и 4 еженедельных копии.

Переменные окружения:
    SSH_HOST, SSH_PASSWORD или SSH_PRIVATE_KEY
    POSTGRES_PASSWORD
"""

import os
import posixpath
import sys

from ssh_connect import connect, run

HOST = os.environ.get("SSH_HOST", "188.116.23.111")
DB_CONTAINER = "investigation-db"
FILE_VOLUME = "investigation-sources"
BACKUP_DIR = "/opt/investigation/backups"
DAILY_KEEP = 7
WEEKLY_KEEP = 4

# Таблицы, по которым сверяется восстановленный дамп. Пустая база восстанавливается
# без ошибок, поэтому проверять надо содержимое, а не факт успешного restore.
VERIFY_TABLES = ["organization", "investigation_case", "claim", "source", "audit_event"]


def psql(container_env, database, sql):
    return (
        f"docker exec -e PGPASSWORD={container_env} {DB_CONTAINER} "
        f"psql -U postgres -d {database} -tAc \"{sql}\""
    )


def main():
    password = os.environ.get("POSTGRES_PASSWORD", "").strip()
    if not password:
        print("ERROR: не задан POSTGRES_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = connect()
    try:
        _, stamp, _ = run(client, "date -u +%Y%m%dT%H%M%SZ", quiet=True)
        stamp = stamp.strip()
        run(client, f"mkdir -p {BACKUP_DIR}/daily {BACKUP_DIR}/weekly", quiet=True)

        dump_name = f"investigation-{stamp}.dump"
        dump_path = posixpath.join(BACKUP_DIR, "daily", dump_name)

        print("снимаю дамп базы")
        run(client, (
            f"docker exec -e PGPASSWORD={password} {DB_CONTAINER} "
            f"pg_dump -U postgres -d investigation -Fc -Z 6 > {dump_path}"
        ))
        _, size, _ = run(client, f"stat -c %s {dump_path}", quiet=True)
        if int(size.strip()) < 1024:
            run(client, f"rm -f {dump_path}", check=False, quiet=True)
            raise RuntimeError("дамп подозрительно мал: копия удалена")
        print(f"дамп снят: {dump_name}, {int(size.strip())} байт")

        print("проверяю восстановлением во временную базу")
        verify_db = f"verify_{stamp.lower().replace('-', '_')}"
        run(client, psql(password, "postgres", f"drop database if exists {verify_db}"), quiet=True)
        run(client, psql(password, "postgres", f"create database {verify_db}"), quiet=True)
        try:
            run(client, (
                f"cat {dump_path} | docker exec -i -e PGPASSWORD={password} {DB_CONTAINER} "
                f"pg_restore -U postgres -d {verify_db} --no-owner --no-privileges"
            ), check=False)

            for table in VERIFY_TABLES:
                _, source_count, _ = run(
                    client, psql(password, "investigation", f"select count(*) from {table}"), quiet=True)
                _, restored_count, _ = run(
                    client, psql(password, verify_db, f"select count(*) from {table}"), quiet=True)
                if source_count.strip() != restored_count.strip():
                    raise RuntimeError(
                        f"восстановление расходится по {table}: "
                        f"в базе {source_count.strip()}, в копии {restored_count.strip()}"
                    )
                print(f"  {table}: {source_count.strip()} строк совпадает")
        except Exception:
            run(client, f"rm -f {dump_path}", check=False, quiet=True)
            raise
        finally:
            run(client, psql(password, "postgres", f"drop database if exists {verify_db}"),
                check=False, quiet=True)

        print("архивирую том с оригиналами источников")
        sources_name = f"sources-{stamp}.tar.gz"
        run(client, (
            f"docker run --rm -v {FILE_VOLUME}:/data -v {BACKUP_DIR}/daily:/backup alpine "
            f"tar czf /backup/{sources_name} -C /data ."
        ))

        # Еженедельная копия по понедельникам: месячная глубина хранения на случай,
        # когда повреждение обнаружено не сразу.
        _, weekday, _ = run(client, "date -u +%u", quiet=True)
        if weekday.strip() == "1":
            run(client, f"cp {dump_path} {BACKUP_DIR}/weekly/{dump_name}", quiet=True)
            run(client, f"cp {BACKUP_DIR}/daily/{sources_name} {BACKUP_DIR}/weekly/{sources_name}",
                quiet=True)
            print("создана еженедельная копия")

        print("ротация")
        for folder, keep in (("daily", DAILY_KEEP), ("weekly", WEEKLY_KEEP)):
            for prefix in ("investigation-", "sources-"):
                run(client, (
                    f"ls -1t {BACKUP_DIR}/{folder}/{prefix}* 2>/dev/null | tail -n +{keep + 1} "
                    f"| xargs -r rm -f"
                ), check=False, quiet=True)

        _, listing, _ = run(client, f"ls -1sh {BACKUP_DIR}/daily | tail -n +2", quiet=True)
        print("текущие ежедневные копии:")
        print(listing.strip())
        print("резервное копирование завершено и проверено восстановлением")
    finally:
        client.close()


if __name__ == "__main__":
    main()
