# AI Investigation Platform

Документация платформы внутренних расследований («Объяснительная / Investigator AI»).
Платформа разрабатывается в этом репозитории как отдельный продукт и не связана с
предметной логикой SmartOil.

## Что читать в зависимости от задачи

| Задача | Документ |
|---|---|
| Понять архитектуру и принятые решения | `adr-0001-architecture.md` |
| Разобраться в сущностях и связях | `entity-model.md` |
| Проверить права и изоляцию данных | `permissions-model.md` |
| Понять методологические правила | `methodology.md` |
| Узнать состав и границы агентов | `agent-catalog.md` |
| Узнать текущий шаг и приоритет | `mvp-plan.md` |
| Развернуть схемы в приложение Base44 | `../../../investigation/README.md` |

## Устройство кода

```text
investigation/entities/          схемы Base44 (генерируются)
investigation/functions/         serverless-функции платформы
investigation/tools/             генераторы схем и приёмочный прогон
src/investigation/domain/        перечисления, коды, время, уверенность, хэширование
src/investigation/repositories/  контракты хранения и реализации на Base44
src/investigation/engine/        машина стадий, инварианты, next best action, цикл раундов
src/investigation/agents/        framework агентов и определения агентов
src/investigation/services/      прикладной слой для UI
src/investigation/testing/       клиент в памяти для приёмки и симулятора
src/investigation/fixtures/      демонстрационное дело Missing Cash 001
```

## Команды

```bash
npm run investigation:entities     # перегенерировать схемы Base44 и перечисления
npm run investigation:acceptance   # приёмочный прогон по §81 ТЗ
```

## Главный принцип

Система не устанавливает виновность. Она организует расследование так, чтобы человеку было
значительно сложнее пропустить противоречие, доказательство или альтернативную версию.
