import { Injectable } from '@angular/core';
import { AgentBase, RunStreamedResult } from './agent-base';
import { AUDITOR_SCHEMA } from '../gemini.schemas';
import {
  AUDITOR_SYSTEM,
  AuditableWidgets,
  buildAuditorContents,
} from '../gemini.prompts';
import { AgentId, AuditorOutput } from '../../types/agent.types';

@Injectable({ providedIn: 'root' })
export class AuditorAgent extends AgentBase {
  readonly id: AgentId = 'auditor';

  async run(
    userIntent: string,
    widgetSnapshot: AuditableWidgets,
  ): Promise<RunStreamedResult<AuditorOutput>> {
    return this.runStreamed<AuditorOutput>({
      contents: buildAuditorContents(userIntent, widgetSnapshot),
      systemInstruction: AUDITOR_SYSTEM,
      schema: AUDITOR_SCHEMA,
      ground: false,
    });
  }
}
