import { Service } from '@angular/core';
import { SpecialistAgentBase } from './agent-base';
import { VENUE_SCHEMA } from '../gemini.schemas';
import { VENUE_SYSTEM } from '../gemini.prompts';
import { AgentId } from '../../types/agent.types';
import { VenueResult } from '../../types/widget.types';

@Service()
export class VenueAgent extends SpecialistAgentBase<VenueResult> {
  readonly id: AgentId = 'venue';
  protected readonly systemInstruction = VENUE_SYSTEM;
  protected readonly schema = VENUE_SCHEMA;
  protected override readonly ground = true;
}
