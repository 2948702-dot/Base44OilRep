/**
 * AGENT 03 — INVESTIGATION PLANNER (§25 ТЗ).
 *
 * Создаёт исследовательские вопросы, конкурирующие версии, план сбора доказательств и
 * порядок интервью.
 *
 * Ключевое требование методологии: для каждой версии обязательно сформулировать, какое
 * доказательство её подтвердит и какое опровергнет. Версия, которую невозможно опровергнуть
 * ничем, бесполезна для расследования.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { InvestigationPlanSchema } from '../schemas.js';
import { HYPOTHESIS_TYPE } from '../../domain/enums.js';

export const investigationPlannerAgent = defineAgent({
  id: 'investigation_planner',
  version: '1.0.0',
  promptVersion: 'investigation_planner/2026-08-1',
  title: 'Investigation Planner',
  role: `
Ты строишь план расследования по результатам intake.

Обязательные требования:
- Не менее трёх существенно различных версий. Версии, отличающиеся формулировкой, но не
  проверяемые разными доказательствами, считаются одной.
- Среди версий обязаны присутствовать как минимум одна exculpatory (никто не присваивал
  средства) и как минимум одна объясняющая событие ошибкой: учётной, технической или
  процедурной.
- Для каждой версии: чем она подтвердится и чем опровергнется. Оба списка непустые.
- Issue — это исследовательский вопрос, а не заявление. «Были ли деньги переданы
  администратору?» — issue. «Деньги пропали» — allegation.
- Порядок интервью строится от наименее вовлечённых и наиболее информированных к тем,
  чьи объяснения затрагивают спорный эпизод напрямую.
- Запросы доказательств упорядочиваются по ожидаемому приросту информации, а не по простоте.
`,
  allowedEntityTypes: ['InvestigationCase', 'Person', 'Allegation', 'Issue', 'Source'],
  forbiddenActions: [
    'формировать менее трёх различных версий',
    'создавать версию без доказательств, которые могли бы её опровергнуть',
    'называть основную версию единственно возможной',
    'планировать обвинительное интервью до сбора объективных материалов',
  ],
  outputSchema: InvestigationPlanSchema,
  outputContract: {
    issues: [{ question: 'исследовательский вопрос', description: 'строка', priority: 'low | medium | high | critical', related_allegations: ['A-001'] }],
    hypotheses: [{
      description: 'формулировка версии',
      type: `один из: ${HYPOTHESIS_TYPE.join(' | ')}`,
      evidence_that_would_support: ['конкретное доказательство'],
      evidence_that_would_contradict: ['конкретное доказательство'],
      addresses_issues: ['I-001'],
    }],
    objectives: ['цель расследования'],
    evidence_requests: [{
      description: 'что запросить',
      source_type: 'тип источника',
      holder: 'у кого запрашивать или null',
      resolves: ['I-001'],
      expected_information_gain: 'very_low | low | moderate | high | very_high',
      urgency: 'low | medium | high',
    }],
    interview_order: [{ person: 'имя', round: 1, reason: 'почему в этом порядке' }],
    investigative_tasks: [{ title: 'строка', task_type: 'тип задачи', reason: 'строка', priority: 'low | medium | high | critical' }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [investigationCase, persons, allegations, sources, issues] = await Promise.all([
      repositories.cases.get(caseId),
      repositories.persons.list({ case_id: caseId }),
      repositories.allegations.list({ case_id: caseId }),
      repositories.sources.list({ case_id: caseId }),
      repositories.issues.list({ case_id: caseId }),
    ]);
    return {
      investigationCase,
      persons,
      allegations,
      sources,
      issues,
      inputObjectIds: [caseId, ...allegations.map((a) => a.id)],
    };
  },

  buildPrompt(input, gathered) {
    const c = gathered.investigationCase ?? {};
    return {
      caseData: {
        case: { title: c.title, case_type: c.case_type, estimated_loss: c.estimated_loss, currency: c.currency },
        persons: gathered.persons.map((p) => ({
          name: p.name, job_title: p.job_title, participant_type: p.participant_type,
          relationship_to_incident: p.relationship_to_incident,
        })),
        allegations: gathered.allegations.map((a) => ({
          code: a.code, description: a.description, amount: a.amount, currency: a.currency, status: a.status,
        })),
        existing_issues: gathered.issues.map((i) => ({ code: i.code, question: i.question })),
        available_sources: gathered.sources.map((s) => ({
          type: s.type, title: s.title, integrity_status: s.integrity_status,
        })),
      },
      userData: c.description ?? '',
      inputDigest: `${c.id}:plan:${gathered.allegations.length}`,
    };
  },
});
