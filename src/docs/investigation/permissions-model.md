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

## 4. Два уровня защиты

Права проверяются дважды, и это не дублирование: уровни отвечают на разные вопросы.

### Уровень 1. Изоляция арендатора — PostgreSQL RLS

Отвечает на вопрос «чьи это данные». Каждая таблица несёт политику:

```sql
using (
  coalesce(current_setting('app.is_system_admin', true), 'off') = 'on'
  or organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
)
```

Правила уровня:

1. Роль приложения создаётся **без** `bypassrls`. Проверка встроена в `migrate.mjs`:
   роль с `bypassrls` останавливает миграцию с объяснением.
2. `app.organization_id` выставляется на транзакцию (`set_config(..., true)`), поэтому
   соединение, вернувшееся в пул, не уносит чужой контекст.
3. Соединение без выставленного контекста не видит ничего. Забытый контекст — это пустой
   результат, а не утечка.
4. `system_admin` — единственная роль вне ограничения организации; флаг выставляется
   только серверным кодом при разрешении сессии.
5. `audit_event`, `agent_run` и `hypothesis_revision` защищены триггером `forbid_mutation`:
   изменение и удаление отклоняются для всех, включая владельца базы.

Проверяется файлом `investigation/db/checks/isolation.sql` в CI при каждом развёртывании.

### Уровень 2. Роли — прикладной слой

Отвечает на вопрос «что этот сотрудник вправе сделать со своими данными». Матрица выше
реализуется проверками `assertCanWrite` и `assertCanApprove` в HTTP-слое и правилами
сервисов (утверждение человеком, переходы стадий, инварианты методологии).

Разделение намеренное: изоляция арендатора не должна зависеть от корректности
прикладного кода, а ролевая модель не должна размазываться по политикам базы,
где её невозможно осмысленно менять.

### Дополнительно

- `delete` в матрице означает soft delete. Физическое удаление доступно только процедуре
  удаления данных арендатора (§60 ТЗ) и идёт каскадом от организации.
- `TrainingCase.ground_truth` не отдаётся агентам расследования: доступ только через
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
