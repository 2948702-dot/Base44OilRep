# План реализации

Порядок задан §76 ТЗ и не меняется произвольно: конкретные агенты не реализуются
до появления Agent Framework.

## Шаг 0 — фундамент (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| Architecture Decision Record | готово | `adr-0001-architecture.md` |
| Entity model | готово | `entity-model.md`, `investigation/tools/entity-definitions.mjs` |
| Permissions model | готово | `permissions-model.md` |
| Схемы Base44 (28 сущностей) | готово | `investigation/entities/*.jsonc` |
| Repository abstractions | готово | `src/investigation/repositories/` |
| File/source subsystem | готово | `src/investigation/services/SourceService.js` |
| Agent Framework | готово | `src/investigation/agents/framework/` |
| Case CRUD и машина стадий | готово | `src/investigation/services/CaseService.js`, `engine/stages.js` |
| Приёмочный прогон §81 | готово | `investigation/tools/acceptance.mjs` |

Реализованные агенты: Case Manager, Intake Analyst, Investigation Planner, Claim Extractor,
Red Team Investigator.

## Phase 1 — оставшееся (§72 ТЗ)

| Приоритет | Работа | Зависит от |
|---|---|---|
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
| P2 | Исполнитель очереди задач поверх background execution Base44 | `InvestigationJob` |

## Phase 2 (§73 ТЗ)

Financial Investigator, Flow of Funds, парсинг банковских выписок, интеграции CRM,
импорт почты и мессенджеров, граф связей, Root Cause, отслеживание корректирующих действий.

## Phase 3 (§74 ТЗ)

Case Library, RAG, PostgreSQL + pgvector вместо первой реализации `KnowledgeStore`,
приём публичных дел, Investigation Simulator с Case Director, Benchmark Suite,
оценка агентов, поиск паттернов между делами.

## Phase 4 (§75 ТЗ)

Neo4j вместо `RelationalGraphRepository` при появлении реальной потребности,
выявление сетей мошенничества, связывание сущностей между делами.

## Что считать готовностью шага

1. Приёмочный прогон `node investigation/tools/acceptance.mjs` проходит полностью.
2. Новый агент имеет схему выхода, объявленные запреты и запись `AgentRun`.
3. Новое правило методологии выражено инвариантом, а не только текстом промпта.
4. `npm run build` и `npm run lint` проходят.
