# AI Investigation Platform

Документация платформы внутренних расследований («Объяснительная / Investigator AI»).
Платформа разрабатывается в этом репозитории как отдельный продукт и не связана с
предметной логикой SmartOil.

## Что читать в зависимости от задачи

| Задача | Документ |
|---|---|
| Понять архитектуру и принятые решения | `adr-0001-architecture.md` |
| Узнать, почему не Base44, и на чём всё работает | `adr-0002-own-stack.md` |
| Разобраться в сущностях и связях | `entity-model.md` |
| Проверить права и изоляцию данных | `permissions-model.md` |
| Понять методологические правила | `methodology.md` |
| Узнать состав и границы агентов | `agent-catalog.md` |
| Узнать текущий шаг и приоритет | `mvp-plan.md` |
| Развернуть платформу и запустить локально | `../../../investigation/README.md` |

## Устройство кода

```text
investigation/db/migrations/     схема PostgreSQL (0001 генерируется, 0002 вручную)
investigation/db/checks/         проверки изоляции арендаторов и неизменяемости журналов
investigation/deploy/            Dockerfile, деплой на VPS, фрагмент конфигурации Caddy
investigation/tools/             генераторы, миграции, приёмка, дымовой прогон, bootstrap
src/investigation/domain/        перечисления, коды, время, уверенность, хэширование
src/investigation/repositories/  контракты хранения; драйверы postgres и memory
src/investigation/engine/        машина стадий, инварианты, next best action, цикл раундов
src/investigation/agents/        framework агентов и определения агентов
src/investigation/services/      прикладной слой
src/investigation/server/        HTTP-контур: аутентификация, дело, участник интервью
src/investigation/fixtures/      демонстрационное дело Missing Cash 001
```

## Команды

```bash
npm run investigation:sql             # перегенерировать схему БД и перечисления
npm run investigation:migrate         # применить миграции
npm run investigation:acceptance      # приёмка §81 на хранилище в памяти
npm run investigation:acceptance:pg   # та же приёмка против настоящей базы
npm run investigation:smoke           # дымовой прогон HTTP-контура
npm run investigation:server          # запустить API
```

## Главный принцип

Система не устанавливает виновность. Она организует расследование так, чтобы человеку было
значительно сложнее пропустить противоречие, доказательство или альтернативную версию.
