import { Component, computed, effect, inject, signal } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { formatCostUsd, formatTokenCount } from '../../core/ai/telemetry-format';
import { toAppError } from '../../core/errors/app-error';
import { NotificationService } from '../../core/errors/notification.service';
import { AgentStore } from '../../core/state/agent.store';
import { SettingsService } from '../../core/settings/settings.service';
import type { AgentTelemetry } from '../../core/types/telemetry.types';
import {
  AgentId,
  AgentState,
  AgentStatus,
  MissingApiKeyError,
  SPECIALIST_IDS,
  SPECIALIST_META,
} from '../../core/types/agent.types';

interface RowMeta {
  id: AgentId;
  label: string;
  icon: string;
}

const ROW_META: Record<AgentId, RowMeta> = {
  planner: { id: 'planner', label: 'Planner', icon: 'hub' },
  auditor: { id: 'auditor', label: 'Auditor (critic)', icon: 'rule' },
  budget: { id: 'budget', label: 'Budget agent', icon: SPECIALIST_META.budget.icon },
  schedule: { id: 'schedule', label: 'Schedule agent', icon: SPECIALIST_META.schedule.icon },
  venue: { id: 'venue', label: 'Venue agent', icon: SPECIALIST_META.venue.icon },
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
  private readonly notifications = inject(NotificationService);
  private readonly settings = inject(SettingsService);

  protected readonly autoHeal = this.settings.autoHeal;

  /** Bumps every 500ms while any agent is active and the tab is visible. */
  private readonly liveTick = signal(0);

  protected readonly globalStatus = this.store.globalStatus;
  protected readonly plannerRationale = this.store.plannerRationale;
  protected readonly runTotals = this.store.runTelemetryTotals;
  protected readonly hasTelemetry = this.store.hasTelemetry;
  protected readonly runWallMs = this.store.runWallDurationMs;

  protected readonly rows = computed<RenderRow[]>(() => {
    this.liveTick();
    const states = this.store.agentStates();
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
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        this.liveTick.update((n) => n + 1);
      }, 500);
      onCleanup(() => clearInterval(handle));
    });
  }

  protected toggleAutoHeal(): void {
    this.settings.toggleAutoHeal();
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

  protected async retry(id: AgentId): Promise<void> {
    try {
      await this.orchestrator.retryAgent(id);
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      this.notifications.errorFrom(toAppError(err));
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
  return undefined;
}
