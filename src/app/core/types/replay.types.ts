import type { AgentId, AgentStatus } from './agent.types';

export interface ReplayEvent {
  atMs: number;
  id?: AgentId;
  status?: AgentStatus;
  error?: string;
  rationale?: string;
}
