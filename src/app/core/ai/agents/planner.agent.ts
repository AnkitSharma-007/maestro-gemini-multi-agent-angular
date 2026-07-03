import { Service } from '@angular/core';
import { AgentBase } from './agent-base';
import { PLANNER_SCHEMA } from '../gemini.schemas';
import { PLANNER_SYSTEM } from '../gemini.prompts';
import { AgentId, PlannerOutput, SPECIALIST_IDS } from '../../types/agent.types';

@Service()
export class PlannerAgent extends AgentBase {
  readonly id: AgentId = 'planner';

  /**
   * Route the user's brief into per-specialist briefs. If the model omits an
   * agent or returns an unknown id, the missing slot is backfilled with
   * `needed: false` so downstream code can rely on a complete set of three.
   */
  async plan(userIntent: string, signal?: AbortSignal): Promise<PlannerOutput> {
    const { value } = await this.runStreamed<PlannerOutput>({
      contents: userIntent,
      systemInstruction: PLANNER_SYSTEM,
      schema: PLANNER_SCHEMA,
      signal,
    });

    const byId = new Map(value.agents?.map((a) => [a.id, a]) ?? []);
    const agents = SPECIALIST_IDS.map(
      (id) =>
        byId.get(id) ?? {
          id,
          brief: '',
          needed: false,
        },
    );
    return { rationale: value.rationale ?? '', agents };
  }
}
