# investigation/ — платформа расследований

Развёртываемые артефакты платформы AI Investigation: схема базы, инструменты и деплой.
Код приложения — в `src/investigation/`. Документация — в `src/docs/investigation/`.

## Стек

| Слой | Решение |
|---|---|
| База | PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16`) |
| Изоляция арендаторов | Row-level security PostgreSQL, роль приложения без `bypassrls` |
| API | Node 22 + Fastify |
| Очередь | `investigation_job` в той же базе |
| Файлы | Том сервера, путь по SHA-256 содержимого |
| Модель | Anthropic SDK на сервере |
| Прокси | Caddy, автоматический TLS |
| Развёртывание | GitHub Actions → paramiko → Docker на VPS |

Обоснование выбора — `src/docs/investigation/adr-0002-own-stack.md`.

## Генерация

Схема базы, карта таблиц для репозиториев и перечисления домена собираются из одного
источника — `investigation/tools/entity-definitions.mjs`:

```bash
npm run investigation:sql
```

Файлы `investigation/db/migrations/0001_init.sql`,
`src/investigation/repositories/postgres/schema.generated.js` и
`src/investigation/domain/enums.generated.js` редактировать вручную нельзя — изменения
будут потеряны при следующей генерации. CI проверяет, что сгенерированное совпадает
с закоммиченным.

Миграция `0002_auth.sql` написана вручную: это инфраструктура доступа, а не сущность
методологии расследования.

## Локальный запуск

```bash
# База
docker run -d --name investigation-db \
  -e POSTGRES_DB=investigation -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 pgvector/pgvector:pg16

# Роль приложения — обязательно без bypassrls
psql postgres://postgres:postgres@127.0.0.1:5432/investigation \
  -c "create role investigation_app login password 'app' nobypassrls"

# Схема и права
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/investigation \
  APP_DB_ROLE=investigation_app npm run investigation:migrate

# Организация и первый пользователь
DATABASE_URL=postgres://investigation_app:app@127.0.0.1:5432/investigation \
  node investigation/tools/bootstrap-org.mjs \
  --name "ООО Пример" --slug primer --email owner@example.com --password '<пароль>'

# Сервер
DATABASE_URL=postgres://investigation_app:app@127.0.0.1:5432/investigation \
  ANTHROPIC_API_KEY=... npm run investigation:server
```

## Проверки

```bash
npm run investigation:acceptance      # приёмка §81 на хранилище в памяти, 60 проверок
npm run investigation:acceptance:pg   # тот же сценарий против настоящей базы
npm run investigation:smoke           # HTTP-контур: вход, дело, изоляция арендаторов
npm run investigation:jobs            # исполнитель очереди: повторы, отказы, отсрочка
psql "$DATABASE_URL" -f investigation/db/checks/isolation.sql   # изоляция и журналы
```

Приёмка идёт на stub-модели: проверяется не качество формулировок модели, а то, что
система структурно не позволяет нарушить методологию — превратить приблизительное время
в точное, назначить виновного после intake, выдать ссылку на интервью без утверждения
человеком, выпустить факт без доказательства.

`isolation.sql` выполняется ролью приложения и проверяет, что сотрудник одной организации
не достанет дело другой ни списком, ни по прямому идентификатору, что журнал аудита не
правится и что висячие ссылки отклоняются.

## Развёртывание

Разово, до первого запуска:

1. Добавить A-запись `investigation.regattayg.space` → адрес сервера у своего
   DNS-провайдера.
2. Добавить секреты репозитория: `INVESTIGATION_POSTGRES_PASSWORD`, `ANTHROPIC_API_KEY`,
   `N8N_SSH_ROOT_PASSWORD`. Секреты действуют в пределах одного репозитория: значения
   из других репозиториев здесь не видны, их нужно добавить заново.
3. Запустить Action «SETUP - investigation domain and TLS». Он поставит Caddy при
   необходимости, добавит блок сайта, проверит конфигурацию через `caddy validate`
   и откатит изменения, если домен не ответит. Чужие сайты в Caddyfile не затрагиваются.

Дальше — Action **Deploy investigation platform**: он прогоняет обе приёмки, проверку
изоляции и дымовой прогон HTTP, и только затем разворачивает. Деплой сам поднимает
контейнер базы при первом запуске, применяет миграции до перезапуска API и проверяет
`/healthz` перед тем, как считать выкладку успешной.

Порт базы наружу не публикуется: она доступна только внутри сети контейнеров.
API слушает `127.0.0.1:8080`, снаружи его закрывает Caddy.

## Эксплуатация

**Резервные копии.** Action «Backup investigation platform» снимает дамп ежедневно в 02:30 UTC
и обязательно проверяет копию восстановлением во временную базу со сверкой числа строк.
Копия, не прошедшая проверку, удаляется, а запуск считается неуспешным: непроверенная
копия выглядит рабочей ровно до того дня, когда понадобится. Хранение: 7 ежедневных
и 4 еженедельных копии на сервере.

**Перевод доступа на ключи.** Разово:

```bash
ssh-keygen -t ed25519 -C "investigation-deploy" -f investigation-deploy -N ""
```

Добавить `DEPLOY_SSH_PRIVATE_KEY` и `DEPLOY_SSH_PUBLIC_KEY` в секреты репозитория
и запустить Action «SETUP - harden investigation server access». Скрипт сначала
проверяет вход по ключу и только затем отключает пароль; при любом сбое конфигурация
sshd откатывается. После этого деплой и резервное копирование сами перейдут на ключ.

## Что требует внимания владельца

- Доступ к серверу идёт под root по паролю, пока не запущено укрепление (`KI-018`).
- Резервные копии лежат на том же сервере: отказ диска унесёт и данные, и копии.
  Нужно выбрать внешнее хранилище с учётом того, где допустимо хранить персональные
  данные сотрудников (`KI-019`).
- Шифрование при хранении, требуемое §60 ТЗ, не включено (`KI-020`).
