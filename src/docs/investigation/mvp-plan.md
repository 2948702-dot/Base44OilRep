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

## Шаг 2 — замкнутый цикл расследования (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| Agent 05 Interview Strategist | готово | `agents/definitions/interviewStrategist.js` |
| Agent 06 AI Interviewer | готово | `agents/definitions/aiInterviewer.js` |
| Agent 08 Timeline Analyst | готово | `agents/definitions/timelineAnalyst.js` |
| Agent 09 Contradiction Analyst | готово | `agents/definitions/contradictionAnalyst.js` |
| Agent 12 Hypothesis Analyst | готово | `agents/definitions/hypothesisAnalyst.js` |
| Agent 15 Follow-Up Planner | готово | `agents/definitions/followUpPlanner.js` |
| Аналитический цикл §67 целиком | готово | `services/AnalysisService.js` |
| Второй раунд интервью | готово | `services/InterviewService.js` |
| Исполнитель очереди задач | готово | `server/jobRunner.js` |
| Маршруты цикла, интервью и очереди | готово | `server/routes/analysis.js` |
| Экран участника интервью | готово | `server/participantPage.js` |
| Резервное копирование с проверкой восстановления | готово | `investigation/deploy/backup.py` |
| Перевод доступа к серверу на ключи | готово, требует запуска владельцем | `investigation/deploy/harden-server.py` |

Приёмка выросла до 60 проверок и проходит на обоих драйверах хранения;
очередь проверяется отдельно — 11 проверок.

## Phase 1 — оставшееся (§72 ТЗ)

| Приоритет | Работа | Зависит от |
|---|---|---|
| P0 | Развернуть на сервере: поддомен, секреты, первый прогон Action | инфраструктура готова |
| P0 | Запустить укрепление доступа: `SETUP - harden investigation server access` (`KI-018`) | ключи владельца |
| P0 | Приём голосовых ответов и вложений от участника (`KI-025`) | обработчик транскрипции |
| P1 | Транскрипция аудио как задача очереди, обе версии текста | обработчик в jobRunner |
| P1 | Agent 04 Document Analyst с обязательным `source_locator` | SourceService |
| P1 | Agent 10 Evidence Corroboration и связи Claim ↔ Evidence | Evidence |
| P1 | Agent 17 Final Reviewer и Agent 18 Report Writer | Findings |
| P1 | Telegram-бот интервью | веб-интервью |
| P2 | Экраны: Case Dashboard, Timeline, Evidence Matrix, Contradiction Map, Hypothesis Board | сервисы |
| P2 | Agent 14 Defence Reviewer | Findings |
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
3. Проверка очереди `investigation:jobs` проходит.
4. Проверка изоляции `isolation.sql` проходит.
4. Новый агент имеет схему выхода, объявленные запреты и запись `AgentRun`.
5. Новое правило методологии выражено инвариантом, а не только текстом промпта.
6. Новое ограничение целостности выражено в схеме, а не только в коде.
