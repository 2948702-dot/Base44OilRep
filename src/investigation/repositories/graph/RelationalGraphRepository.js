/**
 * Граф расследования поверх реляционных связей.
 *
 * Neo4j в MVP не подключается (§56 ТЗ): граф дела на порядки меньше, чем размер, при котором
 * графовая СУБД начинает окупаться. Здесь реализован контракт GraphRepository, чтобы
 * замена хранилища позже не затронула ни один вызывающий модуль.
 */

import { assertImplements } from '../contracts.js';

/**
 * @param {{repositories: Object}} params набор EntityRepository, возвращаемый фабрикой
 */
export function createRelationalGraphRepository({ repositories }) {
  const {
    persons,
    claims,
    events,
    evidence,
    claimEvidenceLinks,
    contradictions,
    hypotheses,
    transactions,
    moneyFlowEdges,
    sources,
  } = repositories;

  function node(type, id, label, attributes = {}) {
    return { id: `${type}:${id}`, type, label, attributes };
  }

  function edge(from, to, type, attributes = {}) {
    return { from, to, type, attributes };
  }

  async function collect(caseId) {
    const [
      personList,
      claimList,
      eventList,
      evidenceList,
      linkList,
      contradictionList,
      hypothesisList,
      transactionList,
      flowList,
      sourceList,
    ] = await Promise.all([
      persons.list({ case_id: caseId }),
      claims.list({ case_id: caseId }),
      events.list({ case_id: caseId }),
      evidence.list({ case_id: caseId }),
      claimEvidenceLinks.list({ case_id: caseId }),
      contradictions.list({ case_id: caseId }),
      hypotheses.list({ case_id: caseId }),
      transactions.list({ case_id: caseId }),
      moneyFlowEdges.list({ case_id: caseId }),
      sources.list({ case_id: caseId }),
    ]);

    return {
      personList,
      claimList,
      eventList,
      evidenceList,
      linkList,
      contradictionList,
      hypothesisList,
      transactionList,
      flowList,
      sourceList,
    };
  }

  const repository = {
    async buildCaseGraph(caseId) {
      const data = await collect(caseId);
      const nodes = [];
      const edges = [];

      for (const person of data.personList) {
        nodes.push(node('Person', person.id, person.name, { participant_type: person.participant_type }));
      }
      for (const source of data.sourceList) {
        nodes.push(node('Document', source.id, source.title || source.original_filename || source.type, {
          source_type: source.type,
          integrity_status: source.integrity_status,
        }));
      }
      for (const item of data.claimList) {
        nodes.push(node('Claim', item.id, item.claim_code, {
          text: item.normalized_statement || item.text,
          speaker_certainty: item.speaker_certainty,
        }));
        if (item.source_person_id) {
          edges.push(edge(`Person:${item.source_person_id}`, `Claim:${item.id}`, 'MADE_CLAIM'));
        }
        if (item.source_id) {
          edges.push(edge(`Document:${item.source_id}`, `Claim:${item.id}`, 'GENERATED'));
        }
      }
      for (const item of data.evidenceList) {
        nodes.push(node('Evidence', item.id, item.evidence_code, { reliability: item.reliability }));
        if (item.source_id) {
          edges.push(edge(`Document:${item.source_id}`, `Evidence:${item.id}`, 'GENERATED'));
        }
      }
      for (const link of data.linkList) {
        const type = link.relation === 'contradicts' ? 'CONTRADICTS' : 'SUPPORTS';
        edges.push(edge(`Evidence:${link.evidence_id}`, `Claim:${link.claim_id}`, type, {
          relation: link.relation,
          strength: link.strength,
        }));
      }
      for (const item of data.eventList) {
        nodes.push(node('Event', item.id, item.event_code, { description: item.description }));
        for (const personId of item.participant_person_ids ?? []) {
          edges.push(edge(`Person:${personId}`, `Event:${item.id}`, 'PARTICIPATED_IN'));
        }
        for (const claimId of item.source_claim_ids ?? []) {
          edges.push(edge(`Claim:${claimId}`, `Event:${item.id}`, 'RELATES_TO'));
        }
      }
      for (const item of data.contradictionList) {
        edges.push(edge(`Claim:${item.claim_a_id}`, `Claim:${item.claim_b_id}`, 'CONTRADICTS', {
          contradiction_code: item.contradiction_code,
          type: item.type,
          severity: item.severity,
        }));
      }
      for (const item of data.hypothesisList) {
        nodes.push(node('Hypothesis', item.id, item.code, {
          description: item.description,
          status: item.status,
        }));
      }
      for (const item of data.transactionList) {
        nodes.push(node('Transaction', item.id, item.transaction_code, {
          amount: item.amount,
          currency: item.currency,
        }));
      }
      for (const item of data.flowList) {
        edges.push(edge(
          `Entity:${item.source_entity}`,
          `Entity:${item.destination_entity}`,
          'TRANSFERRED_TO',
          {
            amount: item.amount,
            currency: item.currency,
            verification_status: item.verification_status,
            flow_type: item.flow_type,
          },
        ));
      }

      return { nodes, edges };
    },

    async neighbourhood(nodeId, options = {}) {
      const depth = options.depth ?? 1;
      const caseId = options.caseId;
      if (!caseId) throw new Error('neighbourhood требует caseId в options');
      const graph = await repository.buildCaseGraph(caseId);
      const allowed = options.edgeTypes ? new Set(options.edgeTypes) : null;

      const reached = new Set([nodeId]);
      let frontier = [nodeId];
      const usedEdges = [];

      for (let step = 0; step < depth; step += 1) {
        const next = [];
        for (const item of graph.edges) {
          if (allowed && !allowed.has(item.type)) continue;
          if (frontier.includes(item.from) && !reached.has(item.to)) {
            reached.add(item.to);
            next.push(item.to);
            usedEdges.push(item);
          } else if (frontier.includes(item.to) && !reached.has(item.from)) {
            reached.add(item.from);
            next.push(item.from);
            usedEdges.push(item);
          }
        }
        if (next.length === 0) break;
        frontier = next;
      }

      return {
        nodes: graph.nodes.filter((n) => reached.has(n.id)),
        edges: usedEdges,
      };
    },

    /**
     * Поиск путей в ширину. Ограничение глубины обязательно: без него запрос по крупному
     * делу вырождается в перебор.
     */
    async paths(fromId, toId, options = {}) {
      const maxDepth = options.maxDepth ?? 4;
      const caseId = options.caseId;
      if (!caseId) throw new Error('paths требует caseId в options');
      const graph = await repository.buildCaseGraph(caseId);

      const adjacency = new Map();
      for (const item of graph.edges) {
        if (!adjacency.has(item.from)) adjacency.set(item.from, []);
        if (!adjacency.has(item.to)) adjacency.set(item.to, []);
        adjacency.get(item.from).push({ edge: item, next: item.to });
        adjacency.get(item.to).push({ edge: item, next: item.from });
      }

      const found = [];
      const queue = [{ node: fromId, path: [], visited: new Set([fromId]) }];

      while (queue.length > 0) {
        const current = queue.shift();
        if (current.path.length >= maxDepth) continue;
        for (const step of adjacency.get(current.node) ?? []) {
          if (current.visited.has(step.next)) continue;
          const path = [...current.path, step.edge];
          if (step.next === toId) {
            found.push(path);
            continue;
          }
          queue.push({
            node: step.next,
            path,
            visited: new Set([...current.visited, step.next]),
          });
        }
      }

      return found;
    },
  };

  assertImplements('GraphRepository', repository, 'RelationalGraphRepository');
  return repository;
}
