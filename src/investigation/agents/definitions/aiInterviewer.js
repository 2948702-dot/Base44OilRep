/**
 * AGENT 06 — AI INTERVIEWER (§28 ТЗ).
 *
 * Ведёт интервью по методике PEACE: свободный рассказ, затем уточнения дат, сумм,
 * участников и происхождения информации, затем просьба приложить подтверждающие материалы.
 *
 * Изоляция здесь строже, чем у прочих агентов: он видит только план собственного
 * интервью и ответы собственного собеседника. Чужие показания, версии и противоречия
 * не передаются вовсе — не потому, что агент им не поверит, а потому, что любая утечка
 * в формулировку вопроса раскрывает участнику ход расследования.
 */

import { defineAgent } from '../framework/defineAgent.js';
import { InterviewTurnSchema } from '../schemas.js';

export const aiInterviewerAgent = defineAgent({
  id: 'ai_interviewer',
  version: '1.0.0',
  promptVersion: 'ai_interviewer/2026-08-1',
  title: 'AI Interviewer',
  role: `
Ты ведёшь интервью и решаешь, что уточнить после уже полученных ответов.

Правила поведения:
- Уточняй то, что осталось неопределённым: время, суммы, участники, место,
  происхождение сведений («вы это видели сами или вам рассказали?»).
- Проси приложить подтверждающие материалы, если человек ссылается на переписку,
  документ или запись.
- Не переспрашивай то, на что уже получен внятный ответ.
- Не оценивай правдивость сказанного и не комментируй ответы.
- Если человек говорит «около семи», уточни границы («не раньше чего и не позже чего?»),
  но не подталкивай к точному времени, которого он не знает.
- Когда цели интервью закрыты или человек явно исчерпал знание, поставь
  interview_complete = true и объясни почему.

Категорически запрещено: угрожать, обещать или упоминать юридические последствия,
утверждать чью-либо виновность, сообщать выдуманные сведения о доказательствах,
выдавать себя за сотрудника правоохранительных органов, давать юридическую оценку.
`,
  allowedEntityTypes: ['Interview', 'InterviewQuestion', 'InterviewAnswer'],
  forbiddenActions: [
    'угрожать участнику или упоминать юридические последствия',
    'сообщать ложные сведения о собранных доказательствах',
    'выдавать себя за сотрудника правоохранительных органов',
    'давать юридическую оценку как факт',
    'раскрывать показания других участников, версии и противоречия',
    'оценивать правдивость собеседника',
  ],
  outputSchema: InterviewTurnSchema,
  outputContract: {
    assessment: {
      covered_objectives: ['закрытые цели интервью'],
      open_objectives: ['не закрытые цели'],
      unclear_points: ['что осталось неясным'],
    },
    follow_up_questions: [{
      question: 'формулировка',
      question_type: 'clarification | probing | chronology | corroboration | closing',
      purpose: 'что уточняет',
      responds_to_answer_id: 'идентификатор ответа или null',
      sensitive: false,
    }],
    interview_complete: false,
    completion_reason: 'почему интервью можно завершать или нельзя',
    observations: ['наблюдения о материале'],
  },

  async gatherContext(input, context) {
    const { repositories } = context;
    const interview = await repositories.interviews.get(input.interviewId);
    if (!interview) throw new Error(`Интервью ${input.interviewId} не найдено`);

    const [questions, answers] = await Promise.all([
      repositories.questions.list({ interview_id: interview.id }, { sort: 'sequence' }),
      repositories.answers.list({ interview_id: interview.id }),
    ]);

    // Намеренно не читаются: claims других людей, гипотезы, противоречия, заметки следствия.
    return { interview, questions, answers, inputObjectIds: [interview.id] };
  },

  buildPrompt(input, gathered) {
    const plan = gathered.interview.interview_plan ?? {};
    const byQuestion = new Map(gathered.answers.map((a) => [a.question_id, a]));

    return {
      caseData: {
        objectives: plan.objectives ?? [],
        round: gathered.interview.round,
        exchange: gathered.questions.map((q) => {
          const answer = byQuestion.get(q.id);
          return {
            question: q.question,
            question_type: q.question_type,
            answer_id: answer?.id ?? null,
            answer: answer ? (answer.transcript || answer.text) : null,
          };
        }),
      },
      inputDigest: `${gathered.interview.id}:turn:${gathered.answers.length}`,
    };
  },
});
