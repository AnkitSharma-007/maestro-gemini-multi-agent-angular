import type { AgentId } from './agent.types';

/** Normalized token counts from a single Gemini `usageMetadata` payload. */
export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Cumulative usage for one agent across calls in the current run (incl. retries/refines). */
export interface AgentTelemetry {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  apiCalls: number;
}

export type AgentTelemetryMap = Partial<Record<AgentId, AgentTelemetry>>;

export interface RunTelemetryTotals {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  apiCalls: number;
}

export const emptyAgentTelemetry = (): AgentTelemetry => ({
  promptTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  apiCalls: 0,
});

export const emptyRunTotals = (): RunTelemetryTotals => ({
  promptTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  apiCalls: 0,
});
