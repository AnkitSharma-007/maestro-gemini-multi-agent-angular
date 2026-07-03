import { Service } from '@angular/core';
import { SpecialistAgentBase } from './agent-base';
import { SCHEDULE_SCHEMA } from '../gemini.schemas';
import { SCHEDULE_SYSTEM } from '../gemini.prompts';
import { AgentId } from '../../types/agent.types';
import { ScheduleResult } from '../../types/widget.types';

@Service()
export class ScheduleAgent extends SpecialistAgentBase<ScheduleResult> {
  readonly id: AgentId = 'schedule';
  protected readonly systemInstruction = SCHEDULE_SYSTEM;
  protected readonly schema = SCHEDULE_SCHEMA;
  protected override readonly ground = true;
}
