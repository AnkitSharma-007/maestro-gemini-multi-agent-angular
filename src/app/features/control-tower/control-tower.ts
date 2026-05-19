import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AgentStore } from '../../core/state/agent.store';
import {
  AgentId,
  AgentState,
  AgentStatus,
  SPECIALIST_IDS,
} from '../../core/types/agent.types';

interface RowMeta {
  id: AgentId;
  label: string;
  icon: string;
}

const ROW_META: Record<AgentId, RowMeta> = {
  planner: { id: 'planner', label: 'Planner', icon: 'hub' },
  budget: { id: 'budget', label: 'Budget agent', icon: 'payments' },
  schedule: { id: 'schedule', label: 'Schedule agent', icon: 'event_note' },
  venue: { id: 'venue', label: 'Venue agent', icon: 'location_on' },
};

interface RenderRow {
  meta: RowMeta;
  state: AgentState;
  duration?: number;
  isLive: boolean;
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
  imports: [UpperCasePipe, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './control-tower.html',
  styleUrl: './control-tower.scss',
})
export class ControlTower {
  private readonly store = inject(AgentStore);

  protected readonly globalStatus = this.store.globalStatus;
  protected readonly plannerRationale = this.store.plannerRationale;

  protected readonly rows = computed<RenderRow[]>(() => {
    const states = this.store.agentStates();
    const ids: AgentId[] = ['planner', ...SPECIALIST_IDS];
    return ids.map((id) => {
      const state = states[id];
      const isLive = state.status === 'thinking' || state.status === 'streaming';
      const duration = computeDuration(state);
      return { meta: ROW_META[id], state, duration, isLive };
    });
  });

  protected statusLabel(s: AgentStatus): string {
    return STATUS_LABEL[s];
  }

  protected formatDuration(ms?: number): string {
    if (ms === undefined) return '';
    if (ms < 950) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}

function computeDuration(state: AgentState): number | undefined {
  if (state.startedAt && state.completedAt) {
    return Math.max(0, state.completedAt - state.startedAt);
  }
  if (state.startedAt) {
    return Math.max(0, Date.now() - state.startedAt);
  }
  return undefined;
}
