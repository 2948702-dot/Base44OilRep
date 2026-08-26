/**
 * Симулятор расследований и бенчмарк (§51–§52 ТЗ).
 *
 * Сервис делает три вещи: заводит учебные дела в библиотеку, прогоняет по ним настоящее
 * расследование и сохраняет измеренный результат. Скрытая истина при этом не покидает
 * двух мест — записи TrainingCase и Case Director; наружу сервис отдаёт только открытую
 * половину учебного дела.
 */

import { createAgentContext } from '../agents/framework/AgentContext.js';
import { getAgent } from '../agents/registry.js';
import { validateTrainingCase, publicView, toEntity } from '../simulator/trainingCase.js';
import { createScriptedDirector, createAgentDirector } from '../simulator/director.js';
import { runSimulation } from '../simulator/runSimulation.js';
import { BENCHMARK_VERSION, formatReport } from '../simulator/benchmark.js';
import { collectArtifacts } from '../simulator/artifacts.js';
import { scoreRun } from '../simulator/benchmark.js';

export function createSimulatorService({ repositories, scope, llm, makeCaseServices, services }) {
  /**
   * Директор на модели. Каждый его ответ — отдельный запуск агента, попадающий в журнал
   * запусков наравне с остальными: прогон должен быть воспроизводим целиком.
   */
  function agentDirectorFor(trainingCase, caseId) {
    const agent = getAgent('case_director');
    return createAgentDirector(trainingCase, {
      runDirectorAgent: async (request) => {
        const context = createAgentContext({
          caseId,
          organizationId: scope.organizationId,
          actorId: scope.actorId,
          actorType: 'agent',
          repositories,
          llm,
          allowedEntityTypes: ['TrainingCase'],
        });
        return agent.run({ ...request, trainingCaseId: trainingCase.id }, context);
      },
    });
  }

  return {
    /** Заводит или обновляет учебное дело в библиотеке организации. */
    async loadTrainingCase(document) {
      validateTrainingCase(document);

      const existing = (await repositories.trainingCases.list({ title: document.title }))[0];
      const payload = toEntity(document);

      return existing
        ? repositories.trainingCases.update(existing.id, payload)
        : repositories.trainingCases.create(payload);
    },

    /**
     * Список учебных дел без скрытой истины.
     *
     * Открытая половина отдаётся людям и интерфейсу. Скрытая не отдаётся никому, кроме
     * Case Director: учебное дело, ответ к которому виден, перестаёт быть учебным.
     */
    async listTrainingCases() {
      const cases = await repositories.trainingCases.list({});
      return cases.map((item) => publicView({
        slug: item.id,
        title: item.title,
        type: item.type,
        published: item.published,
        initial_information: item.initial_information,
        persons: item.persons ?? [],
        evidence_sequence: item.evidence_sequence ?? [],
        expected_investigative_actions: item.expected_investigative_actions ?? [],
        ground_truth: null,
      }));
    },

    /**
     * Прогон учебного дела и его оценка.
     *
     * @param {Object} params
     * @param {string} params.trainingCaseId
     * @param {'scripted'|'agent'} [params.directorMode]
     * @param {Object} [params.limits]
     */
    async run({ trainingCaseId, directorMode = 'scripted', limits, onStep } = {}) {
      const trainingCase = await repositories.trainingCases.get(trainingCaseId);
      if (!trainingCase) throw new Error(`Учебное дело ${trainingCaseId} не найдено`);

      const run = await repositories.simulationRuns.create({
        training_case_id: trainingCase.id,
        training_case_slug: trainingCase.title,
        status: 'running',
        director_mode: directorMode,
        investigator_model: llm?.model ?? null,
        benchmark_version: BENCHMARK_VERSION,
        started_at: new Date().toISOString(),
        steps: [],
        interactions: [],
      });

      try {
        const director = directorMode === 'agent'
          ? agentDirectorFor(trainingCase, null)
          : createScriptedDirector(trainingCase);

        const result = await runSimulation({
          services,
          makeCaseServices,
          trainingCase,
          director,
          limits,
          onStep,
        });

        await repositories.simulationRuns.update(run.id, {
          case_id: result.caseId,
          status: 'completed',
          finished_at: new Date().toISOString(),
          steps: result.steps,
          interactions: result.interactions,
        });

        const benchmark = await repositories.benchmarkResults.create({
          simulation_run_id: run.id,
          training_case_id: trainingCase.id,
          training_case_slug: trainingCase.title,
          benchmark_version: BENCHMARK_VERSION,
          scored_at: new Date().toISOString(),
          metrics: result.metrics,
          summary: result.summary,
          safety_passed: result.safetyPassed,
          safety_failures: result.safetyFailures,
        });

        return { run, benchmark, ...result };
      } catch (error) {
        await repositories.simulationRuns.update(run.id, {
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: error.message,
        });
        throw error;
      }
    },

    /**
     * Пересчёт оценки по сохранённому делу.
     *
     * Метрика, которую нельзя посчитать заново на тех же данных, не является измерением.
     */
    async rescore(simulationRunId) {
      const run = await repositories.simulationRuns.get(simulationRunId);
      if (!run) throw new Error(`Прогон ${simulationRunId} не найден`);
      if (!run.case_id) throw new Error(`Прогон ${simulationRunId} не дошёл до создания дела`);

      const trainingCase = await repositories.trainingCases.get(run.training_case_id);
      const app = makeCaseServices(run.case_id);
      const artifacts = await collectArtifacts(app.repositories, run.case_id);

      return scoreRun({
        artifacts,
        groundTruth: trainingCase?.ground_truth ?? {},
        interactions: run.interactions ?? [],
      });
    },

    formatReport,
  };
}
