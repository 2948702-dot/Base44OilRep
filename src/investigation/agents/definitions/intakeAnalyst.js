/**
 * AGENT 02 — INTAKE ANALYST (§24 ТЗ).
 *
 * Получает свободное описание инцидента и извлекает структуру. Ничего не додумывает:
 * отсутствующее фиксируется в unknowns, а не заполняется правдоподобным значением.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { IntakeAnalysisSchema } from '../schemas.js';
import { PARTICIPANT_TYPE } from '../../domain/enums.js';

export const intakeAnalystAgent = defineAgent({
  id: 'intake_analyst',
  version: '1.0.0',
  promptVersion: 'intake_analyst/2026-08-1',
  title: 'Intake Analyst',
  role: `
Ты разбираешь первичное описание инцидента и превращаешь его в структуру.

Правила:
- Извлекай только то, что сказано. Отсутствующее записывай в unknowns.
- Не назначай никому participant_type "subject". На этапе intake роль человека
  определяется его связью с инцидентом, а не подозрением.
- Приблизительные даты и суммы сохраняй приблизительными: «около семи» — это интервал
  с precision "hour", а не 19:00:00; «примерно 74 тысячи» — amount 74000 с precision
  "approximate".
- Заявленное («капитан утверждает, что передал деньги») — это allegation, а не факт.
- Упомянутые материалы («есть переписка», «была камера») записывай в known_sources
  с availability "claimed", пока они не получены.
`,
  allowedEntityTypes: ['InvestigationCase'],
  forbiddenActions: [
    'назначать participant_type = subject',
    'достраивать даты, суммы, имена и обстоятельства, отсутствующие в описании',
    'переводить заявление в утверждение о факте',
  ],
  outputSchema: IntakeAnalysisSchema,
  outputContract: {
    persons: [{
      name: 'строка',
      role: 'строка или null',
      job_title: 'строка или null',
      organization: 'строка или null',
      participant_type: `один из: ${PARTICIPANT_TYPE.filter((t) => t !== 'subject').join(' | ')}`,
      relationship_to_incident: 'строка или null',
      mentioned_as: 'дословный фрагмент описания, где упомянут человек',
    }],
    organizations: [{ name: 'строка', role: 'строка или null' }],
    allegations: [{ description: 'строка', amount: 'число или null', currency: 'строка или null', stated_by: 'имя или null' }],
    dates: [{ text: 'как сказано в описании', normalized_start: 'ISO 8601 или null', normalized_end: 'ISO 8601 или null', precision: 'exact | minute | hour | part_of_day | day | week | month | range | unknown' }],
    amounts: [{ text: 'как сказано', amount: 'число или null', currency: 'строка или null', precision: 'exact | approximate | unknown' }],
    locations: ['строка'],
    known_sources: [{ description: 'строка', type: 'тип источника', availability: 'available | claimed | unknown' }],
    unknowns: ['что осталось неизвестным после разбора описания'],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const investigationCase = await context.repositories.cases.get(context.caseId);
    return { investigationCase, inputObjectIds: [context.caseId] };
  },

  buildPrompt(input, gathered) {
    const c = gathered.investigationCase ?? {};
    return {
      caseData: {
        case_number: c.case_number,
        title: c.title,
        case_type: c.case_type,
        incident_start_at: c.incident_start_at,
        incident_end_at: c.incident_end_at,
        location: c.location,
        estimated_loss: c.estimated_loss,
        currency: c.currency,
      },
      userData: input.description ?? c.description ?? '',
      documents: input.documents ?? [],
      inputDigest: `${c.id}:intake`,
    };
  },
});
