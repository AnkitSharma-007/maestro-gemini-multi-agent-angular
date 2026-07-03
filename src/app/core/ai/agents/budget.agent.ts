import { Service } from '@angular/core';
import { SpecialistAgentBase } from './agent-base';
import { BUDGET_SCHEMA } from '../gemini.schemas';
import { BUDGET_SYSTEM } from '../gemini.prompts';
import { AgentId } from '../../types/agent.types';
import { BudgetResult } from '../../types/widget.types';

@Service()
export class BudgetAgent extends SpecialistAgentBase<BudgetResult> {
  readonly id: AgentId = 'budget';
  protected readonly systemInstruction = BUDGET_SYSTEM;
  protected readonly schema = BUDGET_SCHEMA;
}
