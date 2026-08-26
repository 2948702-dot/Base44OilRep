/**
 * AGENT 08 — TIMELINE ANALYST (§30 ТЗ).
 *
 * Собирает события из утверждений и находит разрывы, пересечения, невозможные
 * последовательности и конкурирующие времена.
 *
 * Главное ограничение: при наличии альтернативных источников агент не выбирает одну
 * версию времени. Он сохраняет обе и называет, что могло бы их развести. Выбор между
 * источниками — работа следователя, а не модели.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { TimelineSchema } from '../schemas.js';

export const timelineAnalystAgent = defineAgent({
  id: 'timeline_analyst',
  version: '1.0.0',
  promptVersion: 'timeline_analyst/2026-08-1',
  title: 'Timeline Analyst',
  role: `
Ты строишь хронологию дела из атомарных утверждений.

Правила:
- Каждое событие опирается минимум на одно утверждение; коды указываются в
  source_claim_codes. Событие без источника не существует.
- Точность времени берётся из утверждений и не повышается. Если источники дают
  «около семи» и «в начале восьмого», событие получает интервал, покрывающий оба,
  и precision не выше hour.
- Если два источника дают несовместимые времена одного события, обе версии попадают
  в competing_versions с указанием их источников. Ни одна не объявляется верной.
- gaps — периоды, о которых нет ни одного утверждения и которые важны для дела.
  Для каждого объясни, почему разрыв существен.
- impossible_sequences — последовательности, невозможные физически или логически:
  человек в двух местах одновременно, деньги получены после того, как потрачены,
  документ подписан раньше события, которое описывает.
- Не достраивай события, о которых никто не говорил, даже если они кажутся очевидными.
`,
  allowedEntityTypes: ['Claim', 'InvestigationEvent', 'Person', 'Evidence'],
  forbiddenActions: [
    'выбирать одну версию времени при наличии конкурирующих источников',
    'повышать точность времени сверх заявленной в утверждениях',
    'создавать событие без ссылки на утверждение',
    'достраивать события, о которых нет утверждений',
  ],
  outputSchema: TimelineSchema,
  outputContract: {
    events: [{
      event_code_hint: 'краткое имя события',
      event_type: 'payment | handover | arrival | departure | communication | document_created | system_action | observation | other',
      description: 'строка',
      start_at: 'ISO 8601 или null',
      end_at: 'ISO 8601 или null',
      time_precision: 'exact | minute | hour | part_of_day | day | week | month | range | unknown',
      location: 'строка или null',
      participant_names: ['имена'],
      source_claim_codes: ['C-001'],
      confidence: 'very_low | low | moderate | high | very_high',
      competing_versions: [{
        start_at: 'ISO 8601 или null',
        end_at: 'ISO 8601 или null',
        time_precision: 'уровень точности',
        source_claim_codes: ['C-014'],
        note: 'чем эта версия отличается',
      }],
    }],
    gaps: [{ from: 'ISO или null', to: 'ISO или null', description: 'строка', why_it_matters: 'строка' }],
    impossible_sequences: [{
      description: 'строка',
      involved_claim_codes: ['C-002'],
      what_would_resolve_it: 'какое доказательство разрешит',
    }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [claims, persons, existingEvents] = await Promise.all([
      repositories.claims.list({ case_id: caseId }),
      repositories.persons.list({ case_id: caseId }),
      repositories.events.list({ case_id: caseId }),
    ]);
    return { claims, persons, existingEvents, inputObjectIds: claims.map((c) => c.id) };
  },

  buildPrompt(input, gathered) {
    const personById = new Map(gathered.persons.map((p) => [p.id, p.name]));
    return {
      caseData: {
        claims: gathered.claims.map((c) => ({
          code: c.claim_code,
          statement: c.normalized_statement || c.text,
          said_by: personById.get(c.source_person_id) ?? 'источник не назван',
          time_start: c.time_start,
          time_end: c.time_end,
          time_precision: c.time_precision,
          speaker_certainty: c.speaker_certainty,
          location: c.location,
          amount: c.amount,
          currency: c.currency,
        })),
        existing_events: gathered.existingEvents.map((e) => ({
          code: e.event_code, description: e.description, start_at: e.start_at,
        })),
      },
      inputDigest: `timeline:${gathered.claims.length}`,
    };
  },
});
