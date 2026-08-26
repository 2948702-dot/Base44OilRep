/**
 * Интервью, доступ участника и извлечение утверждений.
 *
 * Участник не регистрируется на платформе. Доступ даёт подписанная ссылка, ограниченная
 * делом, человеком, интервью и сроком (§65 ТЗ). В хранилище лежит только хэш токена:
 * утечка базы не должна давать доступ к чужим интервью.
 */

import { sha256OfText } from '../domain/hash.js';
import { nextCode } from '../domain/codes.js';
import { assertClaimIsAttributed } from '../engine/invariants.js';
import { createAgentContext } from '../agents/framework/AgentContext.js';
import { getAgent } from '../agents/registry.js';
import { MVP_INTERVIEW_CHANNELS } from '../domain/enums.js';

const DEFAULT_TTL_HOURS = 72;

/** Криптостойкий токен для персональной ссылки. */
function generateToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createInterviewService({ repositories, scope, llm, approvals, sources }) {
  return {
    /**
     * @param {{personId: string, round?: number, channel: string, plan?: Object}} input
     */
    async createInterview(input) {
      if (!MVP_INTERVIEW_CHANNELS.includes(input.channel)) {
        throw new Error(
          `Канал ${input.channel} не поддерживается в MVP: доступны ${MVP_INTERVIEW_CHANNELS.join(', ')}`,
        );
      }
      return repositories.interviews.create({
        person_id: input.personId,
        round: input.round ?? 1,
        status: 'planned',
        channel: input.channel,
        interview_plan: input.plan ?? null,
        language: input.language ?? 'ru',
      });
    },

    /**
     * Первый содержательный вопрос обязан быть открытым (PEACE, §28 ТЗ).
     * Нарушение отклоняется здесь, а не остаётся на усмотрение генератора вопросов.
     */
    async addQuestions(interviewId, questions) {
      const existing = await repositories.questions.list({ interview_id: interviewId });
      const startSequence = existing.length;

      if (startSequence === 0 && questions[0]?.question_type !== 'open') {
        throw new Error(
          'Первый содержательный вопрос интервью обязан быть открытым: '
          + 'обвинительное или уточняющее начало разрушает свободный рассказ',
        );
      }

      const created = [];
      for (const [index, question] of questions.entries()) {
        created.push(await repositories.questions.create({
          interview_id: interviewId,
          question: question.question,
          question_type: question.question_type,
          purpose: question.purpose ?? null,
          issue_id: question.issue_id ?? null,
          hypothesis_ids: question.hypothesis_ids ?? [],
          sequence: startSequence + index + 1,
          generated_by: question.generated_by ?? 'agent',
          generated_by_agent: question.generated_by_agent ?? null,
          agent_run_id: question.agent_run_id ?? null,
          sensitive: question.sensitive ?? false,
          status: 'draft',
        }));
      }
      return created;
    },

    /**
     * Выдача персональной ссылки. Требует утверждённой отправки набора интервью:
     * без approval ссылка не создаётся (§42 ТЗ).
     *
     * @returns {Promise<{token: string, url: string, record: Object}>} токен возвращается
     * один раз и больше нигде не хранится в открытом виде
     */
    async issueAccessToken(interviewId, { baseUrl, ttlHours = DEFAULT_TTL_HOURS, channel = 'web' }) {
      const interview = await repositories.interviews.get(interviewId);
      if (!interview) throw new Error(`Интервью ${interviewId} не найдено`);

      const approval = await approvals.findApproved({ approvalType: 'interview_dispatch' });
      if (!approval) {
        throw new Error(
          'Отправка интервью не утверждена: требуется approved-запрос interview_dispatch',
        );
      }

      const token = generateToken();
      const record = await repositories.accessTokens.create({
        interview_id: interviewId,
        person_id: interview.person_id,
        token_hash: await sha256OfText(token),
        channel,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlHours * 3600 * 1000).toISOString(),
        max_uses: 20,
        use_count: 0,
      });

      await repositories.interviews.update(interviewId, {
        status: 'invited',
        dispatch_approval_id: approval.id,
      });

      return { token, url: `${baseUrl}/interview/${token}`, record };
    },

    /**
     * Сохраняет ответ участника. Исходная версия никогда не переписывается: правка
     * транскрипта создаёт новую версию рядом с оригиналом (§17, §64, §71 ТЗ).
     */
    async submitAnswer(input) {
      const question = await repositories.questions.get(input.questionId);
      if (!question) throw new Error(`Вопрос ${input.questionId} не найден`);

      // Оригинал ответа обязан существовать как источник: текст, набранный участником,
      // такой же первичный материал, как аудиозапись, и должен быть неизменяемым.
      let originalSourceId = input.originalSourceId ?? null;
      if (!originalSourceId && !input.audioSourceId && input.text) {
        const source = await sources.ingestText(input.text, {
          type: 'interview_transcript',
          title: `Ответ на вопрос ${input.questionId}`,
          sourcePersonId: input.personId,
        });
        originalSourceId = source.id;
      }

      const answer = await repositories.answers.create({
        original_source_id: originalSourceId,
        question_id: input.questionId,
        interview_id: question.interview_id,
        person_id: input.personId,
        text: input.text ?? null,
        audio_source_id: input.audioSourceId ?? null,
        transcript: input.transcript ?? null,
        transcript_confirmed: input.transcriptConfirmed ?? false,
        duration: input.duration ?? null,
        edited_by_person: false,
        original_version: input.transcript ?? input.text ?? null,
        attachment_source_ids: input.attachmentSourceIds ?? [],
        extraction_status: 'pending',
        received_at: new Date().toISOString(),
      });

      await repositories.questions.update(input.questionId, {
        status: 'answered',
        asked_at: question.asked_at ?? new Date().toISOString(),
      });

      await repositories.jobs.create({
        job_type: 'claim_extraction',
        status: 'queued',
        payload: { answer_id: answer.id },
        attempts: 0,
        scheduled_at: new Date().toISOString(),
      });

      return answer;
    },

    /**
     * Правка транскрипта участником. Обе версии сохраняются: исправленный текст
     * не отменяет того, что было сказано.
     */
    async correctTranscript(answerId, correctedText) {
      const answer = await repositories.answers.get(answerId);
      if (!answer) throw new Error(`Ответ ${answerId} не найден`);
      return repositories.answers.update(answerId, {
        transcript: correctedText,
        transcript_confirmed: true,
        edited_by_person: true,
        original_version: answer.original_version ?? answer.transcript ?? answer.text,
      });
    },

    /**
     * Извлечение атомарных утверждений из ответа. Каждое утверждение проверяется на
     * наличие источника и позиции в нём до записи в дело.
     */
    async extractClaims(answerId) {
      const answer = await repositories.answers.get(answerId);
      if (!answer) throw new Error(`Ответ ${answerId} не найден`);

      const interview = await repositories.interviews.get(answer.interview_id);
      const context = createAgentContext({
        caseId: interview.case_id,
        organizationId: scope.organizationId,
        actorId: scope.actorId,
        actorType: 'agent',
        repositories,
        llm,
      });

      const agent = getAgent('claim_extractor');
      let result;
      try {
        result = await agent.runWithMetadata({ answerId }, context);
      } catch (error) {
        await repositories.answers.update(answerId, { extraction_status: 'failed' });
        throw error;
      }

      const sourceId = answer.original_source_id
        ?? answer.audio_source_id
        ?? interview.transcript_source_id
        ?? null;
      const existing = await repositories.claims.list({}, { includeDeleted: true });
      const codes = existing.map((c) => c.claim_code);

      const created = [];
      for (const claim of result.output.claims) {
        const code = nextCode('claim', codes);
        codes.push(code);

        const record = {
          case_id: interview.case_id,
          claim_code: code,
          source_id: sourceId,
          source_person_id: answer.person_id,
          interview_id: answer.interview_id,
          answer_id: answerId,
          text: claim.text,
          normalized_statement: claim.normalized_statement,
          claim_type: claim.claim_type,
          subject_entity: claim.subject_entity,
          predicate: claim.predicate,
          object_entity: claim.object_entity,
          time_start: claim.time_start,
          time_end: claim.time_end,
          time_precision: claim.time_precision,
          amount: claim.amount,
          currency: claim.currency,
          location: claim.location,
          speaker_certainty: claim.speaker_certainty,
          ai_extraction_confidence: claim.ai_extraction_confidence,
          corroboration_status: 'uncorroborated',
          verification_status: 'unverified',
          source_locator: claim.source_locator,
          created_by_agent: agent.id,
          agent_run_id: result.run.id,
          reviewed_by_human: false,
        };

        assertClaimIsAttributed(record);
        created.push(await repositories.claims.create(record));
      }

      await repositories.answers.update(answerId, { extraction_status: 'completed' });

      return {
        claims: created,
        unresolvedReferences: result.output.unresolved_references,
        agentRunId: result.run.id,
      };
    },
  };
}
