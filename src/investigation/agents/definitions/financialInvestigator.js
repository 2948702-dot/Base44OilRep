/**
 * AGENT 11 — FINANCIAL INVESTIGATOR (§33 ТЗ).
 *
 * Строит две цепочки движения средств: как деньги должны были пройти и как прошли
 * на самом деле. Разрыв между ними — не бухгалтерская погрешность, а место, где
 * расследование обязано искать.
 *
 * Главное ограничение: звено, известное только со слов, не становится фактом от того,
 * что оно правдоподобно. Такое ребро остаётся неподтверждённым, и это видно в отчёте.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { FinancialAnalysisSchema } from '../schemas.js';

export const financialInvestigatorAgent = defineAgent({
  id: 'financial_investigator',
  version: '1.0.0',
  promptVersion: 'financial_investigator/2026-08-1',
  title: 'Financial Investigator',
  role: `
Ты разбираешь движение денег по делу.

Построй две цепочки:
- expected_flow: как средства должны были пройти согласно установленному порядку,
  договору или обычной практике организации. Это норматив, а не факт;
- actual_flow: как они прошли по имеющимся материалам. Каждое звено сопровождается
  тем, чем оно подтверждается.

Правила:
- Звено, подтверждённое только словами участника, получает verification_status
  «unverified» независимо от того, насколько оно правдоподобно. Отсутствие возражений
  подтверждением не является.
- «verified» ставится только при наличии объективного материала: банковской выписки,
  кассового документа, записи в учётной системе, чека.
- unexplained_gaps — места, где деньги исчезают из цепочки. Для каждого назови,
  что конкретно объяснило бы разрыв.
- missing_transfers — переводы, которые должны были быть по нормативу, но которых нет
  в материалах. Их отсутствие само по себе — не хищение, а вопрос.
- amount_mismatches — расхождения сумм между источниками, включая расхождение между
  заявленной и учтённой суммой.
- duplicate_transactions — признаки задвоения одной операции.

Не приписывай движению денег намерения. «Деньги не поступили в кассу» — наблюдение;
«деньги присвоены» — вывод, который делает не ты и не на этом материале.

Приблизительные суммы остаются приблизительными: «примерно 74 тысячи» не превращается
в 74 000,00.
`,
  allowedEntityTypes: [
    'MoneyTransaction', 'MoneyFlowEdge', 'Claim', 'Evidence', 'Source',
    'InvestigationEvent', 'Person', 'InvestigationCase',
  ],
  forbiddenActions: [
    'помечать звено проверенным без объективного финансового материала',
    'приписывать движению денег намерение или квалификацию',
    'превращать приблизительную сумму в точную',
    'называть разрыв в цепочке хищением',
  ],
  outputSchema: FinancialAnalysisSchema,
  outputContract: {
    expected_flow: [{
      sequence: 1,
      source_entity: 'от кого',
      destination_entity: 'кому',
      amount: 'число или null',
      currency: 'RUB',
      expected_at: 'ISO 8601 или null',
      basis: 'на чём основан норматив',
    }],
    actual_flow: [{
      sequence: 1,
      source_entity: 'от кого',
      destination_entity: 'кому',
      amount: 'число или null',
      currency: 'RUB',
      occurred_at: 'ISO 8601 или null',
      time_precision: 'exact | minute | hour | part_of_day | day | week | month | range | unknown',
      evidence_codes: ['E-001'],
      claim_codes: ['C-002'],
      verification_status: 'unverified | partially_verified | verified | contradicted',
    }],
    unexplained_gaps: [{
      description: 'где деньги исчезают',
      amount: 'число или null',
      currency: 'RUB',
      between: 'между какими звеньями',
      what_would_explain_it: ['конкретный материал'],
    }],
    duplicate_transactions: [{ description: 'строка', transaction_codes: ['TX-001'], why_suspected: 'строка' }],
    missing_transfers: [{ expected: 'какой перевод ожидался', amount: 'число или null', currency: 'RUB', why_expected: 'строка' }],
    amount_mismatches: [{
      description: 'строка',
      stated_amount: 'число или null',
      actual_amount: 'число или null',
      currency: 'RUB',
      source_of_discrepancy: 'откуда расхождение',
    }],
    missing_financial_evidence: [{ description: 'чего не хватает', holder: 'у кого или null', would_resolve: 'что разрешит' }],
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories, caseId } = context;
    const [investigationCase, claims, evidence, transactions, edges, events, persons] =
      await Promise.all([
        repositories.cases.get(caseId),
        repositories.claims.list({ case_id: caseId }),
        repositories.evidence.list({ case_id: caseId }),
        repositories.transactions.list({ case_id: caseId }),
        repositories.moneyFlowEdges.list({ case_id: caseId }),
        repositories.events.list({ case_id: caseId }),
        repositories.persons.list({ case_id: caseId }),
      ]);

    return {
      investigationCase, claims, evidence, transactions, edges, events, persons,
      inputObjectIds: [caseId],
    };
  },

  buildPrompt(input, gathered) {
    const personById = new Map(gathered.persons.map((p) => [p.id, p.name]));

    // Денежными считаются утверждения с суммой либо описывающие передачу и оплату:
    // сузить только по наличию amount значит потерять «передал деньги» без цифры.
    const financialClaims = gathered.claims.filter(
      (c) => c.amount != null
        || /деньг|оплат|перевод|касс|наличн|сумм|платёж|платеж/i.test(c.normalized_statement || c.text || ''),
    );

    return {
      caseData: {
        case: {
          title: gathered.investigationCase?.title,
          estimated_loss: gathered.investigationCase?.estimated_loss,
          currency: gathered.investigationCase?.currency,
          description: gathered.investigationCase?.description,
        },
        participants: gathered.persons.map((p) => ({
          name: p.name, job_title: p.job_title, relationship_to_incident: p.relationship_to_incident,
        })),
        financial_claims: financialClaims.map((c) => ({
          code: c.claim_code,
          statement: c.normalized_statement || c.text,
          said_by: personById.get(c.source_person_id) ?? 'источник не назван',
          amount: c.amount,
          currency: c.currency,
          time_start: c.time_start,
          time_end: c.time_end,
          time_precision: c.time_precision,
          speaker_certainty: c.speaker_certainty,
          corroboration_status: c.corroboration_status,
        })),
        evidence: gathered.evidence.map((e) => ({
          code: e.evidence_code, description: e.description, type: e.type, reliability: e.reliability,
        })),
        known_transactions: gathered.transactions.map((t) => ({
          code: t.transaction_code,
          payer: t.payer,
          receiver: t.receiver,
          amount: t.amount,
          currency: t.currency,
          actual_at: t.actual_at,
          verification_status: t.verification_status,
        })),
        existing_edges: gathered.edges.map((e) => ({
          from: e.source_entity, to: e.destination_entity, amount: e.amount,
          flow_type: e.flow_type, verification_status: e.verification_status,
        })),
        timeline: gathered.events.map((e) => ({
          code: e.event_code, description: e.description, start_at: e.start_at,
        })),
      },
      inputDigest: `financial:${financialClaims.length}:${gathered.transactions.length}`,
    };
  },
});
