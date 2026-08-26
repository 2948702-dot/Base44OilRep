/**
 * Исполнитель фоновых задач (§57 ТЗ).
 *
 * Тяжёлые операции — транскрипция, разбор документов, извлечение утверждений, пересборка
 * хронологии, поиск противоречий, пересмотр версий — не выполняются как синхронные
 * запросы интерфейса. Они ставятся в очередь `investigation_job` и выполняются здесь.
 *
 * Очередь живёт в той же базе: отдельный Redis не вводится, пока для него нет причины.
 * Захват задачи идёт через `for update skip locked`, поэтому несколько экземпляров
 * приложения не возьмут одну задачу дважды.
 *
 * Цикл останавливается на утверждении человеком: после пересмотра версий и независимой
 * проверки исполнитель готовит следующий раунд и создаёт запрос на утверждение,
 * но сам ссылки участникам не рассылает (§42 ТЗ).
 */

import { withTenant } from '../repositories/postgres/pool.js';
import { createInvestigationServices } from '../services/index.js';
import { createWhisperClient } from './transcription.js';

const MAX_ATTEMPTS = 3;
const DEFAULT_INTERVAL_MS = 5000;

/** Что запускать после успешного завершения задачи, если дело идёт в режиме A2. */
const CHAIN = {
  claim_extraction: 'timeline_rebuild',
  timeline_rebuild: 'contradiction_scan',
  contradiction_scan: 'hypothesis_review',
};

/**
 * Захватывает следующую задачу.
 *
 * Выполняется под системным флагом: очередь общая для всех организаций, а контекст
 * арендатора выставляется уже при обработке конкретной задачи.
 */
async function claimNextJob(pool) {
  return withTenant(pool, { organizationId: null, isSystemAdmin: true }, async (client) => {
    const result = await client.query(`
      update investigation_job
      set status = 'running', started_at = now(), attempts = coalesce(attempts, 0) + 1
      where id = (
        select id from investigation_job
        where status = 'queued'
          and (scheduled_at is null or scheduled_at <= now())
          and deleted_at is null
        order by scheduled_at nulls first, created_at
        for update skip locked
        limit 1
      )
      returning *
    `);
    return result.rows[0] ?? null;
  });
}

async function finishJob(pool, job, { status, result, error }) {
  await withTenant(pool, { organizationId: job.organization_id }, (client) => client.query(
    `update investigation_job
     set status = $2, finished_at = now(), result = $3, error = $4
     where id = $1`,
    [job.id, status, result ? JSON.stringify(result) : null, error ?? null],
  ));
}

async function requeue(pool, job, error) {
  const exhausted = Number(job.attempts ?? 0) >= MAX_ATTEMPTS;
  if (exhausted) {
    await finishJob(pool, job, { status: 'failed', error });
    return { requeued: false };
  }
  // Повтор с отсрочкой: мгновенный повтор упирается в ту же причину отказа.
  const delaySeconds = 30 * Number(job.attempts ?? 1);
  await withTenant(pool, { organizationId: job.organization_id }, (client) => client.query(
    `update investigation_job
     set status = 'queued', scheduled_at = now() + ($2 || ' seconds')::interval, error = $3
     where id = $1`,
    [job.id, String(delaySeconds), error],
  ));
  return { requeued: true, delaySeconds };
}

async function enqueue(pool, { organizationId, caseId, jobType, payload = {} }) {
  return withTenant(pool, { organizationId }, async (client) => {
    const result = await client.query(
      `insert into investigation_job
         (organization_id, case_id, job_type, status, payload, attempts, scheduled_at)
       values ($1, $2, $3, 'queued', $4, 0, now())
       returning *`,
      [organizationId, caseId, jobType, JSON.stringify(payload)],
    );
    return result.rows[0];
  });
}

/**
 * @param {{pool: Object, llm?: Object, intervalMs?: number, logger?: Object}} options
 */
export function createJobRunner(options) {
  const { pool, llm, logger = console } = options;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const transcription = options.transcription ?? createWhisperClient();

  let running = false;
  let timer = null;

  function servicesFor(job) {
    return createInvestigationServices({
      scope: {
        organizationId: job.organization_id,
        caseId: job.case_id,
        actorId: 'job_runner',
        actorType: 'system',
        reason: `Фоновая задача ${job.job_type}`,
      },
      pool,
      driver: 'postgres',
      llm,
    });
  }

  const handlers = {
    async claim_extraction(job, services) {
      const answerId = job.payload?.answer_id;
      if (!answerId) throw new Error('claim_extraction без answer_id');
      const extraction = await services.interviews.extractClaims(answerId);
      return { claims: extraction.claims.length, agent_run_id: extraction.agentRunId };
    },

    async timeline_rebuild(job, services) {
      const timeline = await services.analysis.runTimeline(job.case_id);
      return {
        events: timeline.events.length,
        updated: timeline.updatedEvents.length,
        gaps: timeline.gaps.length,
      };
    },

    async contradiction_scan(job, services) {
      const scan = await services.analysis.runContradictionScan(job.case_id);
      return { contradictions: scan.contradictions.length };
    },

    /**
     * Последний автоматический шаг цикла. Дальше требуется человек: следующий раунд
     * не рассылается без утверждения.
     */
    async hypothesis_review(job, services) {
      const review = await services.analysis.runHypothesisReview(job.case_id);

      const primary = review.hypotheses.find((h) => h.type === 'primary');
      let redTeam = null;
      if (primary) {
        redTeam = await services.cases.runRedTeamReview(job.case_id, primary.id);
      }

      const followUp = await services.analysis.runFollowUpPlanning(job.case_id);
      let approvalId = null;
      if (!followUp.recommendStop && followUp.planned.length > 0) {
        const approval = await services.analysis.requestFollowUpApproval(job.case_id, followUp);
        approvalId = approval.id;
      }

      return {
        hypotheses_reviewed: review.hypotheses.length,
        red_team_verdict: redTeam?.review?.verdict ?? null,
        follow_up_people: followUp.planned.length,
        recommend_stop: followUp.recommendStop,
        approval_request_id: approvalId,
      };
    },

    /**
     * Расшифровка голосового ответа.
     *
     * Оригинал записи не изменяется: расшифровка сохраняется отдельным производным
     * источником, а в ответе появляется текст, который участник затем подтверждает
     * или правит (§64 ТЗ). Разбор на утверждения ставится в очередь только после того,
     * как текст появился.
     */
    async transcription(job, services) {
      const { answer_id: answerId, source_id: sourceId } = job.payload ?? {};
      if (!answerId || !sourceId) throw new Error('transcription без answer_id или source_id');

      const source = await services.repositories.sources.get(sourceId);
      if (!source) throw new Error(`Источник ${sourceId} не найден`);
      if (!source.original_file) throw new Error(`У источника ${sourceId} нет файла записи`);

      const audio = await services.repositories.files.read(source.original_file);
      const result = await transcription.transcribe(audio, {
        filename: source.original_filename ?? 'answer.webm',
        mimeType: source.mime_type ?? 'audio/webm',
      });

      const derived = await services.sources.createDerivedSource(sourceId, {
        type: 'interview_transcript',
        text: result.text,
        method: 'whisper',
        meta: { title: `Расшифровка ${source.title ?? source.original_filename ?? sourceId}` },
      });

      await services.repositories.answers.update(answerId, {
        transcript: result.text,
        original_version: result.text,
        // Подтверждение остаётся за человеком: машинная расшифровка не считается
        // тем, что он сказал, пока он это не признал.
        transcript_confirmed: false,
      });

      await services.repositories.jobs.create({
        case_id: job.case_id,
        job_type: 'claim_extraction',
        status: 'queued',
        payload: { answer_id: answerId, reason: 'transcribed' },
        attempts: 0,
        scheduled_at: new Date().toISOString(),
      });

      return {
        transcript_source_id: derived.id,
        characters: result.text.length,
        language: result.language,
      };
    },

    async document_parse() {
      throw new Error('Разбор документов ещё не реализован: см. mvp-plan.md');
    },

    async report_generation() {
      throw new Error('Генерация отчёта ещё не реализована: см. mvp-plan.md');
    },
  };

  /**
   * Продолжает цикл, если дело работает в режиме A2 (автоматические рутинные шаги).
   * В режиме A1 следующий шаг запускает следователь.
   */
  async function maybeChain(job, services) {
    const nextType = CHAIN[job.job_type];
    if (!nextType) return null;

    const investigationCase = await services.repositories.cases.get(job.case_id);
    if (investigationCase?.autonomy_level !== 'A2') return null;

    if (job.job_type === 'claim_extraction') {
      // Хронология пересобирается, когда раунд действительно закончен: иначе она
      // перестраивается после каждого ответа и тратит запуски агентов впустую.
      const interviews = await services.repositories.interviews.list({ case_id: job.case_id });
      const currentRound = Math.max(...interviews.map((i) => Number(i.round ?? 1)), 1);
      const roundInterviews = interviews.filter((i) => Number(i.round ?? 1) === currentRound);
      const allDone = roundInterviews.length > 0
        && roundInterviews.every((i) => ['completed', 'declined', 'expired', 'cancelled'].includes(i.status));
      if (!allDone) return null;
    }

    return enqueue(pool, {
      organizationId: job.organization_id,
      caseId: job.case_id,
      jobType: nextType,
      payload: { chained_from: job.id },
    });
  }

  async function processOne() {
    const job = await claimNextJob(pool);
    if (!job) return false;

    const handler = handlers[job.job_type];
    if (!handler) {
      await finishJob(pool, job, {
        status: 'failed',
        error: `Неизвестный тип задачи: ${job.job_type}`,
      });
      return true;
    }

    const services = servicesFor(job);
    try {
      const result = await handler(job, services);
      const chained = await maybeChain(job, services);
      await finishJob(pool, job, {
        status: 'completed',
        result: { ...result, chained_job_id: chained?.id ?? null },
      });
      logger.info?.({ job: job.id, type: job.job_type, result }, 'задача выполнена');
    } catch (error) {
      const message = error?.message ?? String(error);
      const outcome = await requeue(pool, job, message);
      logger.warn?.(
        { job: job.id, type: job.job_type, error: message, ...outcome },
        outcome.requeued ? 'задача возвращена в очередь' : 'задача провалена окончательно',
      );
    }
    return true;
  }

  async function tick() {
    if (!running) return;
    try {
      // Задачи разбираются подряд, пока очередь не опустеет: пауза нужна только тогда,
      // когда работы нет.
      let processed = true;
      while (running && processed) {
        processed = await processOne();
      }
    } catch (error) {
      logger.error?.({ error: error?.message ?? String(error) }, 'сбой цикла очереди');
    } finally {
      if (running) timer = setTimeout(tick, intervalMs);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      timer = setTimeout(tick, 0);
      logger.info?.({ intervalMs }, 'исполнитель очереди запущен');
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    /** Прогон одной задачи: используется в проверках и при ручном запуске. */
    processOne,
    enqueue: (input) => enqueue(pool, input),
  };
}
