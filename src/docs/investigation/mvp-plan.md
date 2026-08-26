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

## Шаг 3 — итоговый отчёт (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| Agent 17 Final Investigation Reviewer | готово | `agents/definitions/finalReviewer.js` |
| Agent 18 Report Writer | готово | `agents/definitions/reportWriter.js` |
| Выводы, их утверждение человеком, версии отчёта | готово | `services/ReportService.js` |
| Сущность `InvestigationReport` и версионирование | готово | `investigation/db/migrations/0001_init.sql` |
| Маршруты выводов и отчёта | готово | `server/routes/reports.js` |

Приёмка выросла до 77 проверок и проходит на обоих драйверах хранения.

## Шаг 4 — голосовые ответы (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| Приём аудио от участника, неизменяемый оригинал | готово | `services/InterviewService.js` |
| Запись голоса на странице участника | готово | `server/participantPage.js` |
| Расшифровка задачей очереди | готово | `server/jobRunner.js` |
| Распознавание на своём сервере | готово | `server/transcription.js`, `deploy/deploy.py` |
| Подтверждение и правка расшифровки участником | готово | `server/routes/participant.js` |

Голос не уезжает к внешнему провайдеру: модель работает в контейнере на том же сервере,
ограниченном по ядрам и памяти. Расшифровка сохраняется отдельным производным источником
и не подменяет запись; подтверждение остаётся за человеком.

## Шаг 5 — подтверждение, защита и корневые причины (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| Agent 10 Evidence Corroboration | готово | `agents/definitions/corroborationAgent.js` |
| Agent 14 Defence Reviewer | готово | `agents/definitions/defenceReviewer.js` |
| Agent 16 Root Cause Analyst | готово | `agents/definitions/rootCauseAnalyst.js` |
| Связи Claim ↔ Evidence и статусы подтверждённости | готово | `services/AnalysisService.js` |
| Блокировка утверждения вывода после защитной проверки | готово | `services/ReportService.js` |

Подтверждение встроено в аналитический цикл до пересмотра версий: версия, оценённая
по неподтверждённым утверждениям, получила бы уверенность, которой ничто не соответствует.

Приёмка выросла до 90 проверок и проходит на обоих драйверах хранения.

## Шаг 6 — документы и финансы (выполнено)

| Шаг | Состояние | Где |
|---|---|---|
| Agent 04 Document Analyst | готово | `agents/definitions/documentAnalyst.js` |
| Agent 11 Financial Investigator | готово | `agents/definitions/financialInvestigator.js` |
| Извлечение текста с привязкой к месту в оригинале | готово | `server/documentExtraction.js` |
| Приём файлов следователем и разбор задачей очереди | готово | `server/routes/cases.js`, `server/jobRunner.js` |
| Ожидаемое и фактическое движение средств | готово | `services/AnalysisService.js` |

Реализованы все 18 агентов из §22–§40 ТЗ.
Приёмка — 97 проверок, очередь — 24, HTTP-контур — 28.

## Шаг 7 — рабочее место следователя (выполнено)

| Экран | §ТЗ | Где |
|---|---|---|
| Обзор дела | §43 | `server/workspacePage.js` |
| Хронология с фильтрами и конкурирующими версиями | §44 | там же |
| Матрица доказательств с поиском и переходом к оригиналу | §45 | там же |
| Карта противоречий | §46 | там же |
| Доска версий по состояниям | §47 | там же |
| Движение средств: ожидаемое и фактическое | §19, §33 | там же |
| Выводы и отчёт | §39, §40 | там же |

Страница самодостаточна: ни одного внешнего запроса, никакой сборки. Данные отдают
маршруты `server/routes/views.js`, уже связывающие утверждения с доказательствами.

Действия выполняются с экранов: разбор заявления, планирование, аналитический цикл,
классификация выводов, подготовка интервью, решения по запросам утверждения, закрытие
противоречий, утверждение выводов и выпуск отчёта. Каждое решение, которое потом нельзя
будет проверить без объяснения, требует причины прямо в поле рядом с кнопкой.

Три правила экрана, вытекающие из методологии:

1. Цвет никогда не единственный носитель смысла — рядом с пометкой всегда стоит слово.
2. Опровергающее доказательство стоит рядом с подтверждающим и не прячется за фильтром.
3. Приблизительное время выводится приблизительным: «около 19:00», а не «19:00».

## Phase 1 — оставшееся (§72 ТЗ)

| Приоритет | Работа | Зависит от |
|---|---|---|
| P0 | Развернуть на сервере: поддомен, секреты, первый прогон Action | инфраструктура готова |
| P0 | Запустить укрепление доступа: `SETUP - harden investigation server access` (`KI-018`) | ключи владельца |
| P0 | Приём голосовых ответов и вложений от участника (`KI-025`) | обработчик транскрипции |
| P1 | Проверить качество распознавания на живой русской речи (`KI-028`) | развёртывание |
| P1 | Приём вложений от участника | разбор документов |
| P1 | Telegram-бот интервью | веб-интервью |
| P2 | Эмбеддинги и наполнение методологического пространства знаний | pgvector готов |

## Phase 2 (§73 ТЗ)

Выполнено: Financial Investigator, Flow of Funds, Root Cause.

Остаётся: разбор банковских выписок конкретных банков, интеграции CRM, импорт почты
и мессенджеров, экран графа связей, отслеживание выполнения корректирующих действий.

## Phase 3 (§74 ТЗ)

Выполнено: Investigation Simulator с Case Director, библиотека учебных дел со скрытой
истиной, Benchmark Suite из четырнадцати метрик §52 с защитными порогами (`simulator.md`).

Остаётся: RAG поверх уже готового pgvector, приём публичных дел, пополнение библиотеки
учебных дел, поиск паттернов между делами.

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
