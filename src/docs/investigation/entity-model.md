# Entity model. AI Investigation Platform

Канонический список сущностей платформы расследований.

Всё генерируется из одного источника — `investigation/tools/entity-definitions.mjs`:

| Артефакт | Файл | Команда |
|---|---|---|
| Схема PostgreSQL | `investigation/db/migrations/0001_init.sql` | `npm run investigation:sql` |
| Карта таблиц для репозиториев | `src/investigation/repositories/postgres/schema.generated.js` | то же |
| Перечисления домена | `src/investigation/domain/enums.generated.js` | то же |

Расхождение между схемой и кодом невозможно по построению; CI отдельно проверяет, что
сгенерированное совпадает с закоммиченным.

## 0. Общие правила

Каждая сущность несёт:

| Поле | Назначение |
|---|---|
| `id` | `uuid`, `gen_random_uuid()` |
| `organization_id` | изоляция арендатора; по нему работает политика RLS таблицы |
| `case_id` | принадлежность делу (кроме организации, пользователя и учебного дела) |
| `created_at`, `updated_at` | `updated_at` поддерживается триггером базы |
| `deleted_at`, `deleted_by`, `deletion_reason` | soft delete; физическое удаление — только при удалении данных арендатора |

Изоляция обеспечивается row-level security PostgreSQL: роль приложения подключается без
`bypassrls`, а политика каждой таблицы сверяет `organization_id` с `app.organization_id`
текущей транзакции. Забытый фильтр в запросе приводит к пустому результату, а не к утечке.

Три таблицы защищены триггером от изменения и удаления: `audit_event`, `agent_run`,
`hypothesis_revision`. Это гарантия базы, а не соглашение приложения.

Технические идентификаторы (`id`) не показываются пользователю. Человекочитаемые коды (`C-001`, `H-002`, `CONTR-007`)
хранятся отдельными полями и уникальны в пределах дела. Генерация — `src/investigation/domain/codes.js`.

Время: все отметки — ISO 8601 UTC. Приблизительное время выражается парой `start/end` плюс
`time_precision`; «около семи» не превращается в `19:00:00`.

## 1. Карта связей

```text
Organization
  └── InvestigationCase
        ├── Person ──────────────┐
        ├── Allegation           │
        ├── Issue                │
        ├── Hypothesis ── HypothesisRevision
        ├── Source ── Evidence ──┼── ClaimEvidenceLink ── Claim
        ├── Claim ───────────────┘                          │
        ├── InvestigationEvent ←── source_claim_ids ─────────┘
        ├── Contradiction (claim_a_id, claim_b_id)
        ├── Interview ── InterviewQuestion ── InterviewAnswer
        │     └── InterviewAccessToken
        ├── MoneyTransaction ── MoneyFlowEdge
        ├── Finding
        ├── InvestigationTask
        ├── ApprovalRequest
        ├── AgentRun
        ├── InvestigationJob
        └── AuditEvent

KnowledgeDocument (space = methodology | case)
TrainingCase (никогда не внутри production Case)
```

## 2. InvestigationCase

Таблица `investigation_case`. Имя `Case` не используется: слово зарезервировано в SQL.

Поля: `case_number`, `organization_id`, `title`, `description`, `case_type`, `severity`, `status`,
`created_by`, `case_owner_id`, `incident_start_at`, `incident_end_at`, `location`,
`estimated_loss`, `currency`, `confidentiality_level`, `current_stage`, `overall_confidence`,
`autonomy_level`, `finalized_at`.

Статусы: `draft`, `intake`, `planning`, `evidence_collection`, `interviews`, `analysis`,
`follow_up`, `review`, `completed`, `archived`.

Инварианты:

- `overall_confidence` — качественная шкала (`very_low`…`very_high`), не число и не процент;
- переход в `completed` невозможен без approved `ApprovalRequest` типа `final_report_release`;
- `finalized_at` заполняется только вместе с переходом в `completed`.

## 3. Person

Участник дела. Термин `suspect` не используется (§5 ТЗ).

Поля: `case_id`, `name`, `role`, `job_title`, `organization`, `phone`, `email`, `telegram`,
`relationship_to_incident`, `participant_type`, `notes`.

`participant_type`: `subject`, `witness`, `reporter`, `manager`, `victim`, `customer`,
`external`, `investigator`, `unknown`.

Инвариант: перевод в `subject` требует approved `ApprovalRequest` типа `subject_designation`.
Автоматический перевод агентом запрещён.

## 4. Allegation

Первоначально заявленное. Пример `A-001`: «24 августа отсутствует 74 000 ₽, полученных от клиента.»

Поля: `case_id`, `code`, `description`, `source_id`, `status`.

Статусы: `reported`, `partially_supported`, `supported`, `unsupported`, `inconclusive`.

## 5. Issue

Исследовательский вопрос, который нужно установить. Пример `I-004`: «Были ли 74 000 ₽ фактически
переданы администратору?»

Поля: `case_id`, `code`, `question`, `description`, `related_allegation_ids`, `status`, `priority`.

Различие: Allegation — заявление; Issue — вопрос. Одна Allegation порождает несколько Issue.

## 6. Hypothesis

Поля: `case_id`, `code`, `description`, `type`, `status`, `created_by_agent`, `support_score`,
`contradiction_score`, `confidence`, `last_reviewed_at`, `issue_ids`,
`evidence_that_would_support`, `evidence_that_would_contradict`.

Тип: `primary`, `alternative`, `exculpatory`, `procedural`, `accounting_error`,
`technical_error`, `unknown`.

Статус: `active`, `weakened`, `supported`, `contradicted`, `eliminated`, `unresolved`.

Инварианты:

- гипотеза не удаляется после опровержения;
- каждая смена статуса пишется в `HypothesisRevision` с указанием причины и agent run;
- перевод в `eliminated` требует approved `ApprovalRequest` типа `hypothesis_closure`;
- `support_score` и `contradiction_score` — служебные счётчики для сортировки доски,
  они не показываются пользователю как вероятность.

## 7. HypothesisRevision

История версий гипотезы. Поля: `hypothesis_id`, `case_id`, `revision`, `old_status`, `new_status`,
`reason`, `changed_by`, `changed_by_agent`, `agent_run_id`, `snapshot`, `changed_at`.

## 8. Source

Любой источник информации. Файл сам по себе — Source, а не Evidence.

Поля: `case_id`, `type`, `original_file`, `sha256`, `original_filename`, `mime_type`,
`created_at_original`, `received_at`, `uploaded_by`, `source_person_id`, `system_origin`,
`integrity_status`, `derived_from_source_id`, `is_derived`, `untrusted_content`.

Типы: `interview_audio`, `interview_transcript`, `document`, `email`, `messenger`,
`bank_statement`, `accounting_record`, `crm`, `gps`, `cctv`, `photo`, `video`,
`witness_statement`, `system_log`, `external_source`.

Инварианты:

- оригинальный файл не изменяется никогда;
- обработанная версия — новый Source с `is_derived = true` и `derived_from_source_id`;
- `sha256` считается при приёме файла и при повторной проверке целостности;
- `untrusted_content = true` для всего, что пришло извне (по умолчанию — всё).

## 9. Claim

Минимальное самостоятельное утверждение. Одна фраза человека даёт несколько Claim.

Поля: `case_id`, `claim_code`, `source_id`, `source_person_id`, `interview_id`, `answer_id`,
`text`, `normalized_statement`, `claim_type`, `subject_entity`, `predicate`, `object_entity`,
`time_start`, `time_end`, `time_precision`, `amount`, `currency`, `location`,
`speaker_certainty`, `ai_extraction_confidence`, `corroboration_status`, `verification_status`,
`source_locator`.

`speaker_certainty`: `certain`, `probable`, `approximate`, `uncertain`, `hearsay`, `unknown`.

Инварианты:

- Claim всегда ссылается на источник и позицию в нём (`source_locator`: страница, строка,
  timestamp, message id, row id, диапазон символов);
- модальность не усиливается: «кажется» не становится «точно»;
- `claim_type = hearsay` требует указания первоисточника в `object_entity` или `notes`.

## 10. InvestigationEvent

Событие timeline. Имя `Event` не используется как имя сущности.

Поля: `case_id`, `event_code`, `event_type`, `description`, `start_at`, `end_at`,
`time_precision`, `location`, `participant_person_ids`, `source_claim_ids`,
`supporting_evidence_ids`, `confidence`, `competing_versions`.

Инвариант: у события может быть несколько конкурирующих временных версий; система не выбирает
одну автоматически при наличии альтернативных источников. Конкурирующие версии хранятся в
`competing_versions` вместе с источниками каждой.

## 11. Evidence

Материал, потенциально подтверждающий или опровергающий Claim/Hypothesis.

Поля: `case_id`, `evidence_code`, `source_id`, `type`, `description`, `relevance`, `reliability`,
`integrity`, `collected_at`, `collected_by`, `original_hash`, `storage_uri`.

Source становится Evidence после определения его отношения к расследованию. Один Source может
дать несколько Evidence (разные фрагменты банковской выписки).

## 12. ClaimEvidenceLink

Поля: `case_id`, `claim_id`, `evidence_id`, `relation`, `strength`, `explanation`,
`created_by_agent`, `agent_run_id`, `reviewed_by_human`, `reviewed_by`, `reviewed_at`.

`relation`: `supports`, `contradicts`, `partially_supports`, `contextual`, `neutral`.

## 13. Contradiction

Поля: `case_id`, `contradiction_code`, `claim_a_id`, `claim_b_id`, `type`, `severity`,
`description`, `resolution_status`, `recommended_checks`, `resolved_by`, `resolution_note`.

Типы: `direct`, `temporal`, `financial`, `location`, `identity`, `sequence`, `documentary`,
`partial`.

Инвариант: для каждого противоречия агент обязан предложить, какое доказательство могло бы
его разрешить.

## 14. Interview, InterviewQuestion, InterviewAnswer

`Interview`: `case_id`, `person_id`, `round`, `status`, `channel`, `started_at`, `completed_at`,
`original_audio_source_id`, `transcript_source_id`, `summary`, `interview_plan`.

Каналы: `web`, `telegram`, `whatsapp`, `phone_assisted`, `manual`. MVP: `web` + `telegram`.

`InterviewQuestion`: `interview_id`, `case_id`, `question`, `question_type`, `purpose`,
`issue_id`, `hypothesis_ids`, `sequence`, `generated_by`, `generated_by_agent_run_id`,
`approved_by`, `approved_at`, `asked_at`, `sensitive`.

Типы вопросов: `open`, `clarification`, `probing`, `chronology`, `corroboration`, `challenge`,
`closing`.

`InterviewAnswer`: `question_id`, `interview_id`, `case_id`, `person_id`, `text`,
`audio_source_id`, `transcript`, `duration`, `edited_by_person`, `original_version`,
`extraction_status`.

Инварианты:

- первый содержательный вопрос интервью — `open`;
- вопрос с `sensitive = true` не отправляется без approved `ApprovalRequest`;
- правка транскрипта участником не затирает исходную версию: обе хранятся;
- после сохранения Answer ставится job `claim_extraction`.

## 15. InterviewAccessToken

Таблица `interview_access_token`; `token_hash` уникален глобально.

Поля: `case_id`, `interview_id`, `person_id`, `token_hash`, `channel`, `issued_at`, `expires_at`,
`used_at`, `revoked_at`, `max_uses`, `use_count`, `last_ip`, `last_user_agent`.

Инварианты: хранится только хэш токена; ссылка ограничена case + person + interview + сроком;
проверка выполняется серверной функцией.

## 16. MoneyTransaction и MoneyFlowEdge

`MoneyTransaction`: `case_id`, `transaction_code`, `payer`, `receiver`, `amount`, `currency`,
`expected_at`, `actual_at`, `payment_method`, `bank_reference`, `source_id`,
`verification_status`, `related_booking`, `related_event_id`.

`MoneyFlowEdge`: `case_id`, `source_entity`, `destination_entity`, `amount`, `currency`,
`occurred_at`, `evidence_ids`, `verification_status`, `transaction_id`, `sequence`.

Инвариант: ребро без доказательства получает `verification_status = unverified` и отображается
как неподтверждённое, а не как факт.

## 17. Finding

Поля: `case_id`, `finding_code`, `statement`, `finding_type`, `confidence`, `supporting_claim_ids`,
`supporting_evidence_ids`, `contradicting_evidence_ids`, `alternative_explanations`,
`review_status`, `issue_ids`, `hypothesis_ids`, `approved_by`, `approved_at`.

Тип: `fact`, `corroborated_claim`, `inference`, `unresolved`, `procedural_failure`, `root_cause`.

Инвариант: `finding_type = fact` невозможен без непустого `supporting_evidence_ids`.
Проверяется в Engine, а не только в промпте агента.

## 18. AgentRun

Таблица append-only: запись создаётся один раз по завершении запуска. Состояние
незавершённого выполнения живёт в `InvestigationJob`, который изменяем.

Поля: `case_id`, `agent_type`, `agent_version`, `prompt_version`, `model`, `input_object_ids`,
`input_digest`, `output`, `output_schema_version`, `started_at`, `finished_at`,
`input_tokens`, `output_tokens`, `cost`, `status`, `error`, `triggered_by`, `job_id`.

Назначение: воспроизводимость Finding и сравнение моделей (GPT-X vs Claude-X) на одном деле.

## 19. AuditEvent

Поля: `case_id`, `actor`, `actor_type`, `timestamp`, `object_type`, `object_id`, `operation`,
`old_value`, `new_value`, `reason`, `ip`, `device`.

`actor_type`: `user`, `agent`, `system`, `participant`.

Пишется при любом изменении значимых данных, включая soft delete и смену статусов.

## 20. InvestigationTask

Поля: `case_id`, `title`, `description`, `task_type`, `status`, `priority`, `assignee_id`,
`due_at`, `issue_id`, `hypothesis_id`, `contradiction_id`, `person_id`, `evidence_id`,
`expected_information_gain`, `reason`, `created_by_agent`, `agent_run_id`.

Пример: «Запросить CCTV 18:30–19:15», причина: «может непосредственно разрешить CONTR-007»,
information gain: `very_high`.

## 21. ApprovalRequest

Поля: `case_id`, `approval_type`, `object_type`, `object_id`, `requested_by`, `requested_at`,
`status`, `decided_by`, `decided_at`, `decision_note`, `payload`.

`approval_type`: `interview_dispatch`, `sensitive_question`, `subject_designation`,
`hypothesis_closure`, `finding_approval`, `final_report_release`.

## 22. InvestigationJob

Поля: `case_id`, `job_type`, `status`, `payload`, `result`, `error`, `attempts`,
`scheduled_at`, `started_at`, `finished_at`, `agent_run_id`.

Типы: `transcription`, `document_parse`, `claim_extraction`, `timeline_rebuild`,
`contradiction_scan`, `hypothesis_review`, `report_generation`.

## 23. KnowledgeDocument

Поля: `space`, `organization_id`, `case_id`, `title`, `content`, `chunk_index`, `embedding`
(`vector(1536)`, pgvector), `embedding_ref`, `source_id`, `metadata`, `methodology_version`.

Поиск: `semanticSearch` — косинусная близость по `embedding`; `hybridSearch` —
полнотекстовый ранг. Если функция построения эмбеддинга не передана, `semanticSearch`
отказывает явно, а не подменяет себя лексическим поиском молча: тихая подмена качества
поиска — это скрытая потеря полноты.

`space`: `methodology` или `case`. Пространства никогда не смешиваются в одном retrieval.
`case`-документы всегда несут `case_id` и `organization_id`.

## 24. TrainingCase

Учебное дело. Никогда не находится внутри production Case.

Поля: `title`, `type`, `scenario`, `ground_truth`, `initial_information`, `evidence_sequence`,
`persons`, `events`, `claims`, `correct_hypotheses`, `misleading_hypotheses`,
`expected_investigative_actions`, `published`.

Тип: `real_public`, `synthetic`, `fiction_adapted`, `internal_anonymized`.

Инвариант: `ground_truth` недоступен агентам расследования; его читает только Case Director
симулятора.
