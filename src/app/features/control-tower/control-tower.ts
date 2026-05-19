import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { formatCostUsd, formatTokenCount } from '../../core/ai/telemetry-format';
import { AgentStore } from '../../core/state/agent.store';
import type { AgentTelemetry } from '../../core/types/telemetry.types';
import {
  AgentId,
  AgentState,
  AgentStatus,
  MissingApiKeyError,
  SPECIALIST_IDS,
} from '../../core/types/agent.types';

interface RowMeta {
  id: AgentId;
  label: string;
  icon: string;
}

const ROW_META: Record<AgentId, RowMeta> = {
  planner: { id: 'planner', label: 'Planner', icon: 'hub' },
  auditor: { id: 'auditor', label: 'Auditor (critic)', icon: 'rule' },
  budget: { id: 'budget', label: 'Budget agent', icon: 'payments' },
  schedule: { id: 'schedule', label: 'Schedule agent', icon: 'event_note' },
  venue: { id: 'venue', label: 'Venue agent', icon: 'location_on' },
};

interface RenderRow {
  meta: RowMeta;
  state: AgentState;
  duration?: number;
  telemetry?: AgentTelemetry;
  isLive: boolean;
  canRetry: boolean;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Standing by',
  pending: 'Queued',
  thinking: 'Thinking',
  streaming: 'Streaming',
  done: 'Done',
  error: 'Failed',
};

@Component({
  selector: 'dea-control-tower',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    UpperCasePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './control-tower.html',
  styleUrl: './control-tower.scss',
})
export class ControlTower {
  private readonly store = inject(AgentStore);
  private readonly orchestrator = inject(AgentOrchestrator);

  /** Bumps every 250ms while any agent is active so live durations tick. */
  private readonly liveTick = signal(0);

  protected readonly globalStatus = this.store.globalStatus;
  protected readonly plannerRationale = this.store.plannerRationale;
  protected readonly canReplay = this.store.canReplay;
  protected readonly isReplaying = this.store.isReplaying;
  protected readonly runTotals = this.store.runTelemetryTotals;
  protected readonly hasTelemetry = this.store.hasTelemetry;
  protected readonly runWallMs = this.store.runWallDurationMs;

  protected readonly rows = computed<RenderRow[]>(() => {
    this.liveTick();
    const states = this.store.agentStates();
    const replaying = this.store.isReplaying();
    const ids: AgentId[] = ['planner', 'auditor', ...SPECIALIST_IDS];
    return ids.map((id) => {
      const state = states[id];
      const isLive =
        state.status === 'thinking' ||
        state.status === 'streaming' ||
        state.status === 'pending';
      const duration = computeDuration(state, isLive);
      const canRetry =
        state.status === 'error' &&
        !replaying &&
        !this.store.isBusy() &&
        (id === 'auditor' ||
          id === 'planner' ||
          !!this.store.getAgentBrief(id));
      const telemetry = this.store.getAgentTelemetry(id);
      return {
        meta: ROW_META[id],
        state,
        duration,
        telemetry: telemetry?.totalTokens ? telemetry : undefined,
        isLive,
        canRetry,
      };
    });
  });

  constructor() {
    effect((onCleanup) => {
      const states = this.store.agentStates();
      const anyActive = Object.values(states).some(
        (s) =>
          s.status === 'pending' ||
          s.status === 'thinking' ||
          s.status === 'streaming',
      );
      if (!anyActive) return;
      const handle = setInterval(() => {
        this.liveTick.update((n) => n + 1);
      }, 250);
      onCleanup(() => clearInterval(handle));
    });
  }

  protected statusLabel(s: AgentStatus): string {
    return STATUS_LABEL[s];
  }

  protected formatDuration(ms?: number): string {
    if (ms === undefined) return '';
    if (ms < 950) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  protected formatTokens(n: number): string {
    return formatTokenCount(n);
  }

  protected formatCost(usd: number): string {
    return formatCostUsd(usd);
  }

  protected telemetryHint(row: RenderRow): string {
    if (!row.telemetry) return '';
    const t = row.telemetry;
    return `${this.formatTokens(t.totalTokens)} tokens · ${this.formatCost(t.estimatedCostUsd)} est.`;
  }

  protected async replay(): Promise<void> {
    if (!this.canReplay()) return;
    try {
      await this.orchestrator.replayTimeline();
    } catch {
      /* replay is local-only */
    }
  }

  protected async retry(id: AgentId): Promise<void> {
    try {
      await this.orchestrator.retryAgent(id);
    } catch (err) {
      if (err instanceof MissingApiKeyError) return;
    }
  }
}

function computeDuration(state: AgentState, isLive: boolean): number | undefined {
  if (state.startedAt && state.completedAt) {
    return Math.max(0, state.completedAt - state.startedAt);
  }
  if (state.startedAt && isLive) {
    return Math.max(0, Date.now() - state.startedAt);
  }
  if (state.startedAt && state.completedAt) {
    return Math.max(0, state.completedAt - state.startedAt);
  }
  return undefined;
}
