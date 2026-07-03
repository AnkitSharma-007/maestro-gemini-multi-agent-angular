import type { AppError } from '../errors/app-error';

export type AgentId = 'planner' | 'auditor' | 'budget' | 'schedule' | 'venue';

export type SpecialistId = Exclude<AgentId, 'planner' | 'auditor'>;

export const SPECIALIST_IDS = ['budget', 'schedule', 'venue'] as const satisfies readonly SpecialistId[];

export const SPECIALIST_META: Record<
  SpecialistId,
  { readonly label: string; readonly icon: string }
> = {
  budget: { label: 'Budget', icon: 'payments' },
  schedule: { label: 'Schedule', icon: 'event_note' },
  venue: { label: 'Venue', icon: 'location_on' },
};

export function isSpecialistId(id: AgentId): id is SpecialistId {
  return id === 'budget' || id === 'schedule' || id === 'venue';
}

export type AgentStatus =
  | 'idle'
  | 'pending'
  | 'thinking'
  | 'streaming'
  | 'done'
  | 'error';

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  startedAt?: number;
  completedAt?: number;
  error?: AppError;
}

export interface AgentBrief {
  id: SpecialistId;
  brief: string;
  needed: boolean;
}

export interface PlannerOutput {
  rationale: string;
  agents: AgentBrief[];
}

type AuditSeverity = 'warning' | 'info';

export interface AuditIssue {
  id: string;
  targetId: SpecialistId;
  severity: AuditSeverity;
  message: string;
  autoBrief: string;
}

/** Per-widget quality signal produced by the Auditor's evaluation pass. */
export interface WidgetConfidence {
  targetId: SpecialistId;
  /** Normalized 0..1 quality score. */
  confidence: number;
  /** Up to a few short, concrete weaknesses; empty when the output is strong. */
  weaknesses: string[];
}

export interface AuditorOutput {
  summary: string;
  issues: AuditIssue[];
  confidence?: WidgetConfidence[];
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('No Gemini API key is configured.');
    this.name = 'MissingApiKeyError';
  }
}

type ApiErrorClass = 'auth' | 'quota' | 'network' | 'other';

export function classifyApiError(err: unknown): ApiErrorClass {
  if (err instanceof MissingApiKeyError) return 'auth';
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('permission denied') ||
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('403')
  ) {
    return 'auth';
  }
  if (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate-limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('429')
  ) {
    return 'quota';
  }
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('abort')
  ) {
    return 'network';
  }
  return 'other';
}
