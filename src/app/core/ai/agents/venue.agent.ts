import { Injectable } from '@angular/core';
import { AgentBase } from './agent-base';
import { VENUE_SCHEMA } from '../gemini.schemas';
import { VENUE_SYSTEM, buildRefinePrompt } from '../gemini.prompts';
import { AgentId } from '../../types/agent.types';
import { VenueResult } from '../../types/widget.types';
import { AgentRunResult } from './budget.agent';

@Injectable({ providedIn: 'root' })
export class VenueAgent extends AgentBase {
  readonly id: AgentId = 'venue';

  async run(brief: string, prior?: unknown): Promise<AgentRunResult<VenueResult>> {
    const contents = prior ? buildRefinePrompt(prior, brief) : brief;
    return this.runStreamed<VenueResult>({
      contents,
      systemInstruction: VENUE_SYSTEM,
      schema: VENUE_SCHEMA,
      ground: true,
    });
  }
}
