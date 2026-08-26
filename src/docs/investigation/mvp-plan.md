# План реализации

Порядок задан §76 ТЗ и не меняется произвольно: конкретные агенты не реализуются
до появления Agent Framework.

## Шаг 0 — фундамент (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| Architecture Decision Record | готово | `adr-0001-architecture.md` |
| Entity model | готово | `entity-model.md`, `investigation/tools/entity-definitions.mjs` |
| Permissions model | готово | `permissions-model.md` |
| Repository abstractions | готово | `src/investigation/repositories/` |
| File/source subsystem | готово | `src/investigation/services/SourceService.js` |
| Agent Framework | готово | `src/investigation/agents/framework/` |
| Case CRUD и машина стадий | готово | `src/investigation/services/CaseService.js`, `engine/stages.js` |
| Приёмочный прогон §81 | готово | `investigation/tools/acceptance.mjs` |

## Шаг 1 — собственный стек (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| ADR о смене платформы | готово | `adr-0002-own-stack.md` |
| Схема PostgreSQL + pgvector, 29 таблиц | готово | `investigation/db/migrations/` |
| Изоляция арендаторов через RLS, роль без `bypassrls` | готово и проверено | `investigation/db/checks/isolation.sql` |
| Неизменяемость журналов триггерами базы | готово и проверено | там же |
| Драйверы хранения postgres и memory | готово | `src/investigation/repositories/` |
| Аутентификация сотрудников, сессии | готово | `src/investigation/server/auth.js` |
| HTTP-контур: дело, дашборд, материалы, участник | готово | `src/investigation/server/routes/` |
| Миграции с проверкой хэша и выдачей прав | готово | `investigation/tools/migrate.mjs` |
| Развёртывание на VPS через GitHub Actions | готово | `investigation/deploy/`, `.github/workflows/deploy-investigation.yml` |
| Дымовой прогон HTTP с проверкой изоляции | готово | `investigation/tools/smoke-api.mjs` |

Реализованные агенты: Case Manager, Intake Analyst, Investigation Planner, Claim Extractor,
Red Team Investigator.

## Phase 1 — оставшееся (§72 ТЗ)

| Приоритет | Работа | Зависит от |
|---|---|---|
| P0 | Развернуть на сервере: поддомен, секреты, первый прогон Action | инфраструктура готова |
| P0 | Ключевой доступ к серверу вместо root по паролю (`KI-018`) | — |
| P0 | Резервное копирование базы и тома источников (`KI-019`) | развёртывание |
| P0 | Agent 05 Interview Strategist и Agent 06 AI Interviewer | framework |
| P0 | Web-интервью: экран участника по подписанной ссылке, serverless-проверка токена | `InterviewAccessToken` |
| P0 | Agent 08 Timeline Analyst и Agent 09 Contradiction Analyst | Claim Extractor |
| P0 | Agent 12 Hypothesis Analyst и запись `HypothesisRevision` при пересмотре | Timeline, Contradiction |
| P1 | Транскрипция аудио как job, сохранение обеих версий текста | Job abstraction |
| P1 | Agent 04 Document Analyst с обязательным `source_locator` | SourceService |
| P1 | Telegram-бот интервью | web-интервью |
| P1 | Agent 15 Follow-Up Planner и второй раунд | Hypothesis Analyst |
| P1 | Agent 17 Final Reviewer и Agent 18 Report Writer | Findings |
| P2 | Экраны: Case Dashboard, Timeline, Evidence Matrix, Contradiction Map, Hypothesis Board | сервисы |
| P2 | Agent 14 Defence Reviewer | Findings |
| P1 | Исполнитель очереди `investigation_job` внутри контейнера API | схема |
| P2 | Веб-экран участника интервью поверх готового API | HTTP-контур |
| P2 | Эмбеддинги и наполнение методологического пространства знаний | pgvector готов |

## Phase 2 (§73 ТЗ)

Financial Investigator, Flow of Funds, парсинг банковских выписок, интеграции CRM,
импорт почты и мессенджеров, граф связей, Root Cause, отслеживание корректирующих действий.

## Phase 3 (§74 ТЗ)

Case Library, RAG поверх уже готового pgvector, приём публичных дел,
Investigation Simulator с Case Director, Benchmark Suite, оценка агентов,
поиск паттернов между делами.

## Phase 4 (§75 ТЗ)

Neo4j вместо `RelationalGraphRepository` при появлении реальной потребности,
выявление сетей мошенничества, связывание сущностей между делами.

## Что считать готовностью шага

1. Обе приёмки проходят полностью: `investigation:acceptance` и `investigation:acceptance:pg`.
2. Дымовой прогон HTTP `investigation:smoke` проходит.
3. Проверка изоляции `isolation.sql` проходит.
4. Новый агент имеет схему выхода, объявленные запреты и запись `AgentRun`.
5. Новое правило методологии выражено инвариантом, а не только текстом промпта.
6. Новое ограничение целостности выражено в схеме, а не только в коде.
