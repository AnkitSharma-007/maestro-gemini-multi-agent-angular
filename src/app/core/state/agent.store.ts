import { computed, Injectable, signal } from '@angular/core';
import type { AuditableWidgets } from '../ai/gemini.prompts';
import {
  AgentId,
  AgentState,
  AgentStatus,
  AuditIssue,
  SpecialistId,
  SPECIALIST_IDS,
} from '../types/agent.types';
import { estimateCostUsd } from '../ai/gemini-pricing';
import {
  AgentTelemetryMap,
  emptyAgentTelemetry,
  emptyRunTotals,
  RunTelemetryTotals,
  TokenUsage,
} from '../types/telemetry.types';
import {
  Citation,
  DynamicComponentConfig,
  WidgetEntry,
} from '../types/widget.types';
import type { AppError } from '../errors/app-error';

type WidgetMap = Record<WidgetEntry['id'], WidgetEntry | undefined>;
type AgentStateMap = Record<AgentId, AgentState>;

const initialAgentStates = (): AgentStateMap => ({
  planner: { id: 'planner', status: 'idle' },
  auditor: { id: 'auditor', status: 'idle' },
  budget: { id: 'budget', status: 'idle' },
  schedule: { id: 'schedule', status: 'idle' },
  venue: { id: 'venue', status: 'idle' },
});

const initialWidgets = (): WidgetMap => ({
  budget: undefined,
  schedule: undefined,
  venue: undefined,
});

type GlobalStatus = 'idle' | 'planning' | 'running' | 'done' | 'error';

@Injectable({ providedIn: 'root' })
export class AgentStore {
  readonly widgets = signal<WidgetMap>(initialWidgets());
  readonly agentStates = signal<AgentStateMap>(initialAgentStates());
  readonly plannerRationale = signal<string | null>(null);
  readonly auditIssues = signal<AuditIssue[]>([]);
  readonly auditSummary = signal<string | null>(null);
  readonly lastUserIntent = signal<string | null>(null);
  readonly staleWidgets = signal<readonly SpecialistId[]>([]);
  readonly agentBriefs = signal<Partial<Record<AgentId, string>>>({});
  readonly agentTelemetry = signal<AgentTelemetryMap>({});
  readonly runWallStartedAt = signal<number | null>(null);
  readonly runWallEndedAt = signal<number | null>(null);

  readonly runTelemetryTotals = computed<RunTelemetryTotals>(() => {
    const map = this.agentTelemetry();
    let totals = emptyRunTotals();
    for (const row of Object.values(map)) {
      if (!row) continue;
      totals = {
        promptTokens: totals.promptTokens + row.promptTokens,
        outputTokens: totals.outputTokens + row.outputTokens,
        totalTokens: totals.totalTokens + row.totalTokens,
        estimatedCostUsd: totals.estimatedCostUsd + row.estimatedCostUsd,
        apiCalls: totals.apiCalls + row.apiCalls,
      };
    }
    return totals;
  });

  readonly runWallDurationMs = computed(() => {
    const start = this.runWallStartedAt();
    const end = this.runWallEndedAt();
    if (start === null) return undefined;
    const stop = end ?? (this.isBusy() ? Date.now() : undefined);
    if (stop === undefined) return undefined;
    return Math.max(0, stop - start);
  });

  readonly hasTelemetry = computed(() => this.runTelemetryTotals().totalTokens > 0);

  readonly globalStatus = computed<GlobalStatus>(() => {
    const states = this.agentStates();

    if (states.planner.status === 'thinking' || states.planner.status === 'streaming') {
      return 'planning';
    }

    const specialists = SPECIALIST_IDS.map((id) => states[id]);
    const workers = [...specialists, states.auditor];
    const anyRunning = workers.some((a) =>
      a.status === 'pending' || a.status === 'thinking' || a.status === 'streaming',
    );
    if (anyRunning) return 'running';

    const allIdle =
      states.planner.status === 'idle' &&
      specialists.every((a) => a.status === 'idle') &&
      states.auditor.status === 'idle';
    if (allIdle) return 'idle';

    const anyDone = specialists.some((a) => a.status === 'done');
    const anyError = specialists.some((a) => a.status === 'error');
    if (anyDone) return 'done';
    if (anyError && states.planner.status === 'error') return 'error';

    return 'done';
  });

  readonly isBusy = computed(() => {
    const g = this.globalStatus();
    return g === 'planning' || g === 'running';
  });

  readonly hasContent = computed(() => {
    const w = this.widgets();
    return SPECIALIST_IDS.some((id) => !!w[id]);
  });

  /** Increments `generation` on every write so the renderer detects refines. */
  upsertWidget(input: {
    id: WidgetEntry['id'];
    payload: DynamicComponentConfig;
    citations?: Citation[];
  }): WidgetEntry {
    const next: WidgetEntry = {
      id: input.id,
      generation: 0,
      payload: input.payload,
      citations: input.citations,
    };
    let result = next;
    this.widgets.update((map) => {
      const prior = map[input.id];
      const generation = (prior?.generation ?? 0) + 1;
      result = { ...next, generation };
      return { ...map, [input.id]: result };
    });
    return result;
  }

  getWidget(id: WidgetEntry['id']): WidgetEntry | undefined {
    return this.widgets()[id];
  }

  /** `startedAt` is captured on the first active phase; `completedAt` on terminal. */
  setAgentStatus(id: AgentId, status: AgentStatus, error?: AppError): void {
    this.patchAgentState(id, status, error);
  }

  setPlannerRationale(text: string): void {
    this.plannerRationale.set(text);
  }

  setAgentBrief(id: AgentId, brief: string): void {
    this.agentBriefs.update((map) => ({ ...map, [id]: brief }));
  }

  getAgentBrief(id: AgentId): string | undefined {
    return this.agentBriefs()[id];
  }

  touchRunWallEnded(): void {
    this.runWallEndedAt.set(Date.now());
  }

  recordAgentUsage(id: AgentId, usage: TokenUsage, model: string): void {
    const deltaCost = estimateCostUsd(model, usage);
    this.agentTelemetry.update((map) => {
      const prev = map[id] ?? emptyAgentTelemetry();
      return {
        ...map,
        [id]: {
          promptTokens: prev.promptTokens + usage.promptTokens,
          outputTokens: prev.outputTokens + usage.outputTokens,
          totalTokens: prev.totalTokens + usage.totalTokens,
          estimatedCostUsd: prev.estimatedCostUsd + deltaCost,
          apiCalls: prev.apiCalls + 1,
        },
      };
    });
  }

  getAgentTelemetry(id: AgentId) {
    return this.agentTelemetry()[id];
  }

  private patchAgentState(id: AgentId, status: AgentStatus, error?: AppError): void {
    this.agentStates.update((state) => {
      const current = state[id] ?? { id, status: 'idle' as AgentStatus };
      const isActive = status === 'thinking' || status === 'streaming';
      const isTerminal = status === 'done' || status === 'error';
      const restarted =
        isActive &&
        (current.status === 'done' ||
          current.status === 'error' ||
          current.status === 'idle');
      const startedAt = isActive
        ? restarted
          ? Date.now()
          : (current.startedAt ?? Date.now())
        : current.startedAt;
      const completedAt = isTerminal
        ? Date.now()
        : restarted
          ? undefined
          : current.completedAt;
      return {
        ...state,
        [id]: { id, status, error, startedAt, completedAt },
      };
    });
  }

  setLastUserIntent(intent: string): void {
    this.lastUserIntent.set(intent);
  }

  setAuditResult(summary: string, issues: AuditIssue[]): void {
    this.auditSummary.set(summary);
    this.auditIssues.set(issues);
  }

  dismissAuditIssue(issueId: string): void {
    this.auditIssues.update((list) => list.filter((i) => i.id !== issueId));
  }

  clearAuditIssuesForTarget(targetId: WidgetEntry['id']): void {
    this.auditIssues.update((list) => list.filter((i) => i.targetId !== targetId));
  }

  markStale(id: SpecialistId): void {
    this.staleWidgets.update((arr) => (arr.includes(id) ? arr : [...arr, id]));
  }

  unmarkStale(id: SpecialistId): void {
    this.staleWidgets.update((arr) => arr.filter((x) => x !== id));
  }

  clearStale(): void {
    this.staleWidgets.set([]);
  }

  snapshotForAudit(): AuditableWidgets {
    const map = this.widgets();
    return {
      budget: map.budget?.payload,
      schedule: map.schedule?.payload,
      venue: map.venue?.payload,
    };
  }

  resetForRun(): void {
    this.widgets.set(initialWidgets());
    this.agentStates.set(initialAgentStates());
    this.plannerRationale.set(null);
    this.auditIssues.set([]);
    this.auditSummary.set(null);
    this.lastUserIntent.set(null);
    this.runWallStartedAt.set(Date.now());
    this.runWallEndedAt.set(null);
    this.agentBriefs.set({});
    this.agentTelemetry.set({});
    this.clearStale();
  }
}
