/**
 * AGENT 18 — REPORT WRITER (§40 ТЗ).
 *
 * Оформляет результат Final Reviewer в человеческий документ. Новых выводов не делает.
 *
 * Изоляция здесь работает наоборот, чем у прочих агентов: ему передают НЕ материалы дела,
 * а только утверждённые выводы и справочные сведения. Не имея доступа к сырым материалам,
 * он физически не может дописать вывод, которого не было в проверенном наборе.
 *
 * Каждое утверждение разделов ссылается на код вывода — это проверяется схемой,
 * а совпадение кодов с утверждёнными выводами проверяется при записи отчёта.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { ReportSchema } from '../schemas.js';

export const reportWriterAgent = defineAgent({
  id: 'report_writer',
  version: '1.0.0',
  promptVersion: 'report_writer/2026-08-1',
  title: 'Report Writer',
  role: `
Ты оформляешь итоговый документ расследования по утверждённым выводам.

Ты НЕ делаешь выводов. Всё, что попадает в отчёт, уже установлено и проверено;
твоя работа — изложить это так, чтобы человек, не знакомый с делом, понял, что
установлено, на чём это держится и что осталось неизвестным.

Правила изложения:
- Каждое утверждение раздела сопровождается кодами выводов, на которых оно держится.
- Установленные факты и заявления людей не смешиваются в одном абзаце. Читатель должен
  видеть границу без усилий.
- Формулировки описывают действия и их обоснованность, а не личности. Пишется
  «передача наличных не подтверждена объективными материалами», а не «Иванов лжёт».
- Приблизительные величины излагаются приблизительно: «около 19:00», а не «в 19:00».
- Раздел неразрешённых вопросов не сокращается ради связности. Отчёт, умолчавший
  о неизвестном, вводит в заблуждение сильнее, чем отчёт без выводов.
- Рекомендованные действия относятся к порядку работы и контролю, а не к наказанию
  конкретных людей: кадровые решения принимает организация, а не расследование.

Executive Summary пишется для человека, который прочитает только его: в нём должно быть
понятно, что произошло, что установлено достоверно и что осталось открытым.
`,
  allowedEntityTypes: ['Finding'],
  forbiddenActions: [
    'добавлять выводы, отсутствующие в утверждённом наборе',
    'ссылаться на материалы дела напрямую в обход выводов',
    'смешивать установленные факты и заявления людей в одном утверждении',
    'предлагать кадровые или дисциплинарные меры в отношении конкретных людей',
    'сокращать раздел неразрешённых вопросов ради связности',
  ],
  outputSchema: ReportSchema,
  outputContract: {
    title: 'название отчёта',
    executive_summary: [{ text: 'абзац', finding_codes: ['F-001'] }],
    scope: 'что проверялось и что за рамками',
    methodology: 'как велось расследование',
    incident: 'описание инцидента',
    persons: [{ name: 'имя', role: 'должность', relationship_to_incident: 'отношение к событиям' }],
    timeline: [{ when: 'когда', what: 'что', confidence: 'уровень', event_codes: ['EV-001'] }],
    established_facts: [{ text: 'установленный факт', finding_codes: ['F-001'] }],
    claims: [{ text: 'заявление', said_by: 'кто', corroboration: 'чем подтверждается', claim_codes: ['C-001'] }],
    contradictions: [{ text: 'описание', contradiction_codes: ['CONTR-001'], resolution_status: 'состояние' }],
    hypothesis_analysis: [{ hypothesis_code: 'H-001', description: 'версия', status: 'статус', summary: 'итог' }],
    unresolved_questions: ['что осталось неизвестным'],
    recommended_actions: [{ action: 'действие', reason: 'причина', priority: 'low | medium | high | critical' }],
    appendices: [{ title: 'название', content: 'содержимое' }],
    observations: ['наблюдения о материале'],
  },

  /**
   * Передаются только утверждённые выводы и справочные сведения о деле.
   * Утверждения, доказательства и материалы источников намеренно не читаются.
   */
  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [investigationCase, findings, persons, events, contradictions, hypotheses] = await Promise.all([
      repositories.cases.get(caseId),
      repositories.findings.list({ case_id: caseId }),
      repositories.persons.list({ case_id: caseId }),
      repositories.events.list({ case_id: caseId }),
      repositories.contradictions.list({ case_id: caseId }),
      repositories.hypotheses.list({ case_id: caseId }),
    ]);

    const approved = findings.filter((f) => f.review_status === 'approved');
    if (approved.length === 0) {
      throw new Error(
        'Нет утверждённых выводов: отчёт не может быть составлен из непроверенного материала',
      );
    }

    return {
      investigationCase, findings: approved, persons, events, contradictions, hypotheses,
      unresolvedQuestions: input.unresolvedQuestions ?? [],
      inputObjectIds: approved.map((f) => f.id),
    };
  },

  buildPrompt(input, gathered) {
    return {
      caseData: {
        case: {
          number: gathered.investigationCase?.case_number,
          title: gathered.investigationCase?.title,
          case_type: gathered.investigationCase?.case_type,
          incident_start_at: gathered.investigationCase?.incident_start_at,
          incident_end_at: gathered.investigationCase?.incident_end_at,
          location: gathered.investigationCase?.location,
          estimated_loss: gathered.investigationCase?.estimated_loss,
          currency: gathered.investigationCase?.currency,
          description: gathered.investigationCase?.description,
        },
        approved_findings: gathered.findings.map((f) => ({
          code: f.finding_code,
          statement: f.statement,
          type: f.finding_type,
          confidence: f.confidence,
          alternative_explanations: f.alternative_explanations ?? [],
        })),
        persons: gathered.persons.map((p) => ({
          name: p.name,
          job_title: p.job_title,
          participant_type: p.participant_type,
          relationship_to_incident: p.relationship_to_incident,
        })),
        timeline: gathered.events.map((e) => ({
          code: e.event_code,
          description: e.description,
          start_at: e.start_at,
          end_at: e.end_at,
          time_precision: e.time_precision,
          competing_versions: (e.competing_versions ?? []).length,
        })),
        contradictions: gathered.contradictions.map((x) => ({
          code: x.contradiction_code,
          description: x.description,
          resolution_status: x.resolution_status,
        })),
        hypotheses: gathered.hypotheses.map((h) => ({
          code: h.code, description: h.description, status: h.status,
        })),
        unresolved_questions: gathered.unresolvedQuestions,
      },
      inputDigest: `report:${gathered.findings.length}`,
    };
  },
});
