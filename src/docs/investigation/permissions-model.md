# Permissions model. AI Investigation Platform

## 1. Роли

| Роль | Область | Назначение |
|---|---|---|
| `system_admin` | платформа | обслуживание платформы, доступ к техническим журналам |
| `org_owner` | организация | владелец tenant, управление пользователями и настройками |
| `investigation_manager` | организация | создание дел, назначение владельца дела, все approvals |
| `investigator` | назначенные дела | ведение расследования, интервью, анализ |
| `reviewer` | назначенные дела | чтение и утверждение Finding и отчёта, без правки материалов |
| `read_only` | назначенные дела | чтение |
| `interview_participant` | своё интервью | доступ только по подписанному токену |

`interview_participant` не является пользователем платформы: у него нет учётной записи,
он идентифицируется `InterviewAccessToken`.

## 2. Матрица доступа

C — create, R — read, U — update, D — soft delete, A — approve, «—» — нет доступа.

| Сущность | system_admin | org_owner | inv_manager | investigator | reviewer | read_only | participant |
|---|---|---|---|---|---|---|---|
| Organization | CRUD | RU | R | R | R | R | — |
| User | CRUD | CRUD | R | R | R | — | — |
| InvestigationCase | CRUD | CRUD | CRUD | RU | R | R | — |
| Person | CRUD | CRUD | CRUD | CRU | R | R | — |
| Allegation | CRUD | CRUD | CRUD | CRU | R | R | — |
| Issue | CRUD | CRUD | CRUD | CRU | R | R | — |
| Hypothesis | CRUD | CRUD | CRUD+A | CRU | R | R | — |
| HypothesisRevision | R | R | R | R | R | R | — |
| Source | CRUD | CRUD | CRUD | CRU | R | R | C* |
| Evidence | CRUD | CRUD | CRUD | CRU | R | R | — |
| Claim | CRUD | CRUD | CRUD | CRU | R | R | — |
| ClaimEvidenceLink | CRUD | CRUD | CRUD | CRU | R | R | — |
| InvestigationEvent | CRUD | CRUD | CRUD | CRU | R | R | — |
| Contradiction | CRUD | CRUD | CRUD | CRU | R | R | — |
| Interview | CRUD | CRUD | CRUD | CRU | R | R | R* |
| InterviewQuestion | CRUD | CRUD | CRUD+A | CRU | R | R | R* |
| InterviewAnswer | CRUD | CRUD | CRU | CRU | R | R | CR* |
| InterviewAccessToken | CRUD | CRUD | CRUD | CRU | — | — | — |
| MoneyTransaction | CRUD | CRUD | CRUD | CRU | R | R | — |
| MoneyFlowEdge | CRUD | CRUD | CRUD | CRU | R | R | — |
| Finding | CRUD | CRUD | CRUD+A | CRU | RA | R | — |
| InvestigationTask | CRUD | CRUD | CRUD | CRU | R | R | — |
| ApprovalRequest | CRUD | CRUD | CRU+A | CR | RA | R | — |
| AgentRun | R | R | R | R | R | — | — |
| InvestigationJob | CRUD | R | CRU | CRU | R | — | — |
| AuditEvent | R | R | R | R | R | — | — |
| KnowledgeDocument (methodology) | CRUD | R | R | R | R | R | — |
| KnowledgeDocument (case) | CRUD | R | CRU | CRU | R | R | — |
| TrainingCase | CRUD | R | R | R | — | — | — |

`*` — только через serverless-функцию по действительному `InterviewAccessToken`, в пределах
собственного интервью. Прямой клиентский доступ участника к сущностям запрещён.

## 3. Что участник не видит никогда

- ответы других людей;
- гипотезы, противоречия, evidence matrix, findings;
- внутренние заметки следователя и планы интервью;
- сам факт существования других участников, кроме упомянутых им самим;
- ground truth учебных дел.

Follow-up вопросы не раскрывают чужие показания без явной необходимости; раскрытие фрагмента
чужого показания — это `sensitive` вопрос и требует approval.

## 4. Правила RLS Base44

1. Каждое правило начинается с проверки `data.organization_id = {{user.organization_id}}`.
2. `system_admin` — единственная роль, не ограниченная организацией.
3. `read_only` и `reviewer` не получают `create`/`update` ни на одной сущности расследования,
   кроме `ApprovalRequest.update` у `reviewer` (решение по approval) и `Finding.update`
   у `reviewer` только в части `review_status`.
4. `AuditEvent` и `AgentRun` не имеют `update` и `delete` ни для одной роли, включая
   `system_admin`: журнал не редактируется.
5. `delete` в схемах означает soft delete через приложение; жёсткое удаление закрыто для всех,
   кроме процедуры удаления данных tenant (§60 ТЗ), выполняемой отдельной функцией.
6. `TrainingCase.ground_truth` не отдаётся агентам расследования: доступ идёт только через
   Case Director симулятора.

## 5. Ограничение доступа агента

Права агента не равны правам пользователя, который его запустил. `AgentContext.allowedSources`
и `AgentContext.allowedEntityTypes` определяют, что агент вправе прочитать.

Примеры ограничений:

| Агент | Разрешено читать | Запрещено |
|---|---|---|
| Red Team Investigator | structured facts, claims, evidence, текущая формулировка гипотезы | reasoning Hypothesis Analyst, его выводы и оценки |
| Interview Strategist | материалы дела, план раскрытия информации | ничего не раскрывает участнику вне `information_to_reveal` |
| AI Interviewer | только собственный interview plan и ответы текущего участника | показания других людей, гипотезы, противоречия |
| Report Writer | результат Final Reviewer | новые факты, любые источники напрямую |
| Final Reviewer | весь материал дела | добавление новых фактов |

Нарушение — это дефект framework, а не поведение модели: `AgentRunner` не передаёт агенту
данные вне его разрешённого набора.
