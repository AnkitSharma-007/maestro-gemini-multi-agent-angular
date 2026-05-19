import { Injectable } from '@angular/core';
import { AgentBase } from './agent-base';
import { SCHEDULE_SCHEMA } from '../gemini.schemas';
import { SCHEDULE_SYSTEM, buildRefinePrompt } from '../gemini.prompts';
import { AgentId } from '../../types/agent.types';
import { ScheduleResult } from '../../types/widget.types';
import { AgentRunResult } from './budget.agent';

@Injectable({ providedIn: 'root' })
export class ScheduleAgent extends AgentBase {
  readonly id: AgentId = 'schedule';

  async run(brief: string, prior?: unknown): Promise<AgentRunResult<ScheduleResult>> {
    const contents = prior ? buildRefinePrompt(prior, brief) : brief;
    return this.runStreamed<ScheduleResult>({
      contents,
      systemInstruction: SCHEDULE_SYSTEM,
      schema: SCHEDULE_SCHEMA,
      ground: true,
    });
  }
}
