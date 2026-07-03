import { Service } from '@angular/core';
import { AgentBase, AgentRunResult } from './agent-base';
import { AUDITOR_SCHEMA } from '../gemini.schemas';
import {
  AUDITOR_SYSTEM,
  AuditableWidgets,
  buildAuditorContents,
} from '../gemini.prompts';
import { AgentId, AuditorOutput } from '../../types/agent.types';

@Service()
export class AuditorAgent extends AgentBase {
  readonly id: AgentId = 'auditor';

  async run(
    userIntent: string,
    widgetSnapshot: AuditableWidgets,
    signal?: AbortSignal,
  ): Promise<AgentRunResult<AuditorOutput>> {
    return this.runStreamed<AuditorOutput>({
      contents: buildAuditorContents(userIntent, widgetSnapshot),
      systemInstruction: AUDITOR_SYSTEM,
      schema: AUDITOR_SCHEMA,
      signal,
    });
  }
}
