/**
 * Интервью, доступ участника и извлечение утверждений.
 *
 * Участник не регистрируется на платформе. Доступ даёт подписанная ссылка, ограниченная
 * делом, человеком, интервью и сроком (§65 ТЗ). В хранилище лежит только хэш токена:
 * утечка базы не должна давать доступ к чужим интервью.
 */

import { sha256OfText } from '../domain/hash.js';
import { nextCode } from '../domain/codes.js';
import { assertClaimIsAttributed, InvariantViolation } from '../engine/invariants.js';
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

/** Состояния вопроса, в которых участник вправе его видеть и на него отвечать. */
export const PARTICIPANT_VISIBLE_STATUSES = ['approved', 'asked', 'answered'];

export function createInterviewService({ repositories, scope, llm, approvals, sources }) {
  /**
   * Утверждение отправки, охватывающее именно это интервью.
   *
   * Раньше достаточно было любого утверждённого interview_dispatch в организации:
   * одно решение человека по одному делу открывало ссылки участникам всех остальных
   * дел. Утверждение теперь привязано к делу и к перечню интервью, ради которых
   * человек его и принимал.
   */
  async function findDispatchApproval(interview) {
    const candidates = await repositories.approvals.list({
      approval_type: 'interview_dispatch',
      status: 'approved',
    });
    return candidates.find((approval) => {
      if (approval.case_id && interview.case_id && approval.case_id !== interview.case_id) {
        return false;
      }
      if (approval.object_id && approval.object_id === interview.id) return true;
      const ids = approval.payload?.interview_ids ?? [];
      return ids.includes(interview.id);
    }) ?? null;
  }

  /**
   * Открывает участнику утверждённые вопросы интервью.
   *
   * Чувствительный вопрос — тот, что раскрывает человеку чужие показания или ход
   * расследования, — остаётся черновиком: его открывает следователь отдельным решением.
   *
   * @returns {Promise<number>} сколько вопросов доступно участнику после вызова
   */
  async function openQuestionsForParticipant(interviewId) {
    const questions = await repositories.questions.list({ interview_id: interviewId });
    let available = 0;
    for (const question of questions) {
      if (PARTICIPANT_VISIBLE_STATUSES.includes(question.status)) {
        available += 1;
        continue;
      }
      if (question.status !== 'draft' || question.sensitive) continue;
      await repositories.questions.update(question.id, { status: 'asked' });
      available += 1;
    }
    return available;
  }

  return {
    /**
     * Открывает участнику чувствительные вопросы поимённо (§42 ТЗ).
     *
     * Отдельный шаг существует потому, что чувствительный вопрос — это решение о том,
     * что человеку можно сообщить ход расследования. Такое решение принимает человек
     * и объясняет его: обоснование попадает в журнал.
     */
    async approveQuestions(interviewId, questionIds, reason) {
      if (!reason) {
        throw new Error('Открытие вопроса участнику требует обоснования: оно идёт в журнал');
      }
      if (scope.actorType && scope.actorType !== 'user') {
        throw new Error('Вопросы участнику открывает человек, а не агент');
      }

      const updated = [];
      for (const questionId of questionIds ?? []) {
        const question = await repositories.questions.get(questionId);
        if (!question || question.interview_id !== interviewId) {
          throw new Error(`Вопрос ${questionId} не относится к интервью ${interviewId}`);
        }
        if (PARTICIPANT_VISIBLE_STATUSES.includes(question.status)) {
          updated.push(question);
          continue;
        }
        updated.push(await repositories.questions.update(questionId, {
          status: 'approved',
          approved_by: scope.actorId,
          approved_at: new Date().toISOString(),
        }));
      }
      return updated;
    },

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
      // Нумерация считается по всем вопросам, включая мягко удалённые: номер вопроса
      // уникален в пределах интервью на уровне базы, и повторное использование номера
      // удалённого вопроса — отказ записи на ровном месте.
      const all = await repositories.questions.list(
        { interview_id: interviewId }, { includeDeleted: true },
      );
      const startSequence = all.reduce((max, q) => Math.max(max, Number(q.sequence ?? 0)), 0);
      const live = all.filter((q) => !q.deleted_at);

      if (live.length === 0 && questions[0]?.question_type !== 'open') {
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
          // Вопрос рождается черновиком и становится виден участнику только после
          // утверждения человеком (§42 ТЗ). Раньше это состояние никем не снималось,
          // и участник открывал ссылку с пустым списком вопросов.
          status: 'draft',
        }));
      }
      return created;
    },

    /**
     * Подготовка интервью стратегом (§27 ТЗ).
     *
     * Сначала агент раскладывает, что известно следствию и чего раскрывать нельзя,
     * и только потом формулирует вопросы. Список information_not_to_reveal_yet
     * сохраняется в план интервью и служит границей для AI Interviewer.
     */
    async planInterview({ personId, round = 1, channel = 'web', language = 'ru' }) {
      const person = await repositories.persons.get(personId);
      if (!person) throw new Error(`Участник ${personId} не найден`);

      const context = createAgentContext({
        caseId: person.case_id,
        organizationId: scope.organizationId,
        actorId: scope.actorId,
        actorType: 'agent',
        repositories,
        llm,
      });

      const agent = getAgent('interview_strategist');
      const result = await agent.runWithMetadata({ personId, round }, context);
      const plan = result.output;

      if (plan.questions[0]?.question_type !== 'open') {
        throw new InvariantViolation(
          'FIRST_QUESTION_MUST_BE_OPEN',
          'План интервью начинается не с открытого вопроса: свободный рассказ должен '
          + 'предшествовать уточнениям',
        );
      }

      const interview = await repositories.interviews.create({
        case_id: person.case_id,
        person_id: personId,
        round,
        status: 'planned',
        channel,
        language,
        interview_plan: {
          known_to_investigation: plan.known_to_investigation,
          potential_knowledge: plan.potential_knowledge,
          unknown: plan.unknown,
          information_not_to_reveal_yet: plan.information_not_to_reveal_yet,
          objectives: plan.objectives,
          agent_run_id: result.run.id,
        },
      });

      const questions = await this.addQuestions(interview.id, plan.questions.map((q) => ({
        question: q.question,
        question_type: q.question_type,
        purpose: q.purpose,
        sensitive: q.sensitive,
        generated_by: 'agent',
        generated_by_agent: agent.id,
        agent_run_id: result.run.id,
      })));

      return { interview, questions, plan, agentRunId: result.run.id };
    },

    /**
     * Продолжение интервью: уточняющие вопросы по уже полученным ответам (§28 ТЗ).
     *
     * Агент видит только собственное интервью. Чувствительный вопрос остаётся
     * черновиком до утверждения человеком.
     */
    async continueInterview(interviewId) {
      const interview = await repositories.interviews.get(interviewId);
      if (!interview) throw new Error(`Интервью ${interviewId} не найдено`);

      const context = createAgentContext({
        caseId: interview.case_id,
        organizationId: scope.organizationId,
        actorId: scope.actorId,
        actorType: 'agent',
        repositories,
        llm,
      });

      const agent = getAgent('ai_interviewer');
      const result = await agent.runWithMetadata({ interviewId }, context);
      const turn = result.output;

      const added = turn.follow_up_questions.length === 0 ? [] : await this.addQuestions(
        interviewId,
        turn.follow_up_questions.map((q) => ({
          question: q.question,
          question_type: q.question_type,
          purpose: q.purpose,
          sensitive: q.sensitive,
          generated_by: 'agent',
          generated_by_agent: agent.id,
          agent_run_id: result.run.id,
        })),
      );

      if (turn.interview_complete) {
        await repositories.interviews.update(interviewId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          summary: turn.completion_reason,
        });
      }

      return {
        questions: added,
        assessment: turn.assessment,
        complete: turn.interview_complete,
        completionReason: turn.completion_reason,
        agentRunId: result.run.id,
      };
    },

    /**
     * Разворачивает план следующего раунда в интервью и вопросы.
     * Ссылки участникам не выдаются: это отдельное действие после утверждения человеком.
     */
    async startRound(plan) {
      const created = [];
      for (const item of plan.planned) {
        const interview = await repositories.interviews.create({
          case_id: item.person.case_id,
          person_id: item.person.id,
          round: plan.round,
          status: 'planned',
          channel: 'web',
          language: 'ru',
          interview_plan: { objectives: [`Раунд ${plan.round}: ${item.reasonCategory}`] },
        });

        // Первый вопрос раунда всегда открытый: даже уточняющий раунд начинается
        // с приглашения рассказать своими словами, а не с претензии.
        const questions = await this.addQuestions(interview.id, [
          {
            question: 'Пожалуйста, расскажите своими словами, что вы можете добавить '
              + 'к сказанному ранее по этой ситуации.',
            question_type: 'open',
            purpose: 'Свободный рассказ до уточнений следующего раунда',
            generated_by: 'agent',
          },
          ...item.questions,
        ]);

        created.push({ interview, questions, person: item.person });
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

      const approval = await findDispatchApproval(interview);
      if (!approval) {
        throw new Error(
          `Отправка интервью ${interviewId} не утверждена: требуется approved-запрос `
          + 'interview_dispatch, охватывающий это интервью',
        );
      }

      // Утверждён состав раунда — значит утверждены и вопросы этого раунда, кроме
      // чувствительных: их человек открывает отдельно и осознанно. Без этого шага
      // участник получал ссылку на интервью, в котором ему нечего было увидеть.
      const opened = await openQuestionsForParticipant(interviewId);
      if (opened === 0) {
        throw new Error(
          `Интервью ${interviewId} не содержит ни одного вопроса, доступного участнику: `
          + 'ссылка на пустое интервью бесполезна',
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
        // Лимит считает отправленные ответы, а не открытия страницы: участник
        // возвращается к своей ссылке столько раз, сколько ему нужно.
        max_uses: 60,
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
     *
     * Голосовой ответ принимается наравне с текстовым: аудиозапись становится
     * неизменяемым оригиналом, а расшифровка появится позже отдельным производным
     * источником. Часть людей объясняется голосом охотнее, и заставлять их печатать
     * значит терять подробности.
     */
    async submitAnswer(input) {
      const question = await repositories.questions.get(input.questionId);
      if (!question) throw new Error(`Вопрос ${input.questionId} не найден`);
      if (!PARTICIPANT_VISIBLE_STATUSES.includes(question.status)) {
        throw new Error(
          `Вопрос ${input.questionId} не открыт участнику (состояние ${question.status}): `
          + 'ответ на неутверждённый вопрос обошёл бы утверждение человеком',
        );
      }
      if (!input.text && !input.audio && !input.audioSourceId) {
        throw new Error('Ответ должен содержать текст или аудиозапись');
      }

      // Оригинал ответа обязан существовать как источник: и набранный текст,
      // и аудиозапись — первичный материал, который не изменяется.
      let originalSourceId = input.originalSourceId ?? null;
      let audioSourceId = input.audioSourceId ?? null;

      // Имя источника видит следователь в матрице доказательств: идентификатор вопроса
      // там бесполезен, а имя человека и номер вопроса позволяют найти оригинал сразу.
      const person = input.personId ? await repositories.persons.get(input.personId) : null;
      const sourceTitle = `Ответ ${person?.name ?? 'участника'} на вопрос ${question.sequence ?? '?'}`
        + ` (раунд ${(await repositories.interviews.get(question.interview_id))?.round ?? '?'})`;

      if (input.audio && !audioSourceId) {
        const audioSource = await sources.ingestFile(input.audio, {
          type: 'interview_audio',
          title: `Голосовой ${sourceTitle.toLowerCase()}`,
          filename: input.audioFilename ?? 'answer.webm',
          mimeType: input.audioMimeType ?? 'audio/webm',
          sourcePersonId: input.personId,
        });
        audioSourceId = audioSource.id;
        originalSourceId = originalSourceId ?? audioSource.id;
      }

      if (!originalSourceId && input.text) {
        const source = await sources.ingestText(input.text, {
          type: 'interview_transcript',
          title: sourceTitle,
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
        audio_source_id: audioSourceId,
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

      // Голосовой ответ сначала расшифровывается, и только затем разбирается на
      // утверждения: извлекать утверждения не из чего, пока нет текста.
      await repositories.jobs.create({
        job_type: audioSourceId && !input.text ? 'transcription' : 'claim_extraction',
        status: 'queued',
        payload: audioSourceId && !input.text
          ? { answer_id: answer.id, source_id: audioSourceId }
          : { answer_id: answer.id },
        attempts: 0,
        scheduled_at: new Date().toISOString(),
      });

      return answer;
    },

    /**
     * Правка транскрипта участником (§64 ТЗ). Обе версии сохраняются: исправленный
     * текст не отменяет того, что было сказано, а машинная расшифровка не подменяет
     * запись голоса — оригинал остаётся первичным материалом.
     */
    async correctTranscript(answerId, correctedText) {
      const answer = await repositories.answers.get(answerId);
      if (!answer) throw new Error(`Ответ ${answerId} не найден`);
      const updated = await repositories.answers.update(answerId, {
        transcript: correctedText,
        transcript_confirmed: true,
        edited_by_person: true,
        original_version: answer.original_version ?? answer.transcript ?? answer.text,
      });

      // Утверждения извлекаются заново из подтверждённого текста: разбор машинной
      // расшифровки, которую человек поправил, дал бы утверждения, которых он не говорил.
      await repositories.jobs.create({
        job_type: 'claim_extraction',
        status: 'queued',
        payload: { answer_id: answerId, reason: 'transcript_corrected' },
        attempts: 0,
        scheduled_at: new Date().toISOString(),
      });

      return updated;
    },

    /** Подтверждение расшифровки без правки. */
    async confirmTranscript(answerId) {
      const answer = await repositories.answers.get(answerId);
      if (!answer) throw new Error(`Ответ ${answerId} не найден`);
      if (!answer.transcript) throw new Error('Расшифровка ещё не готова');
      return repositories.answers.update(answerId, { transcript_confirmed: true });
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
