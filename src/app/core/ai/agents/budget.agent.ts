import { Injectable } from '@angular/core';
import { AgentBase } from './agent-base';
import { BUDGET_SCHEMA } from '../gemini.schemas';
import { BUDGET_SYSTEM, buildRefinePrompt } from '../gemini.prompts';
import { AgentId } from '../../types/agent.types';
import { BudgetResult, Citation } from '../../types/widget.types';

export interface AgentRunResult<T> {
  value: T;
  citations?: Citation[];
}

@Injectable({ providedIn: 'root' })
export class BudgetAgent extends AgentBase {
  readonly id: AgentId = 'budget';

  async run(brief: string, prior?: unknown): Promise<AgentRunResult<BudgetResult>> {
    const contents = prior ? buildRefinePrompt(prior, brief) : brief;
    return this.runStreamed<BudgetResult>({
      contents,
      systemInstruction: BUDGET_SYSTEM,
      schema: BUDGET_SCHEMA,
    });
  }
}
