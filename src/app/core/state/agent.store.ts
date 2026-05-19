import { computed, Injectable, signal } from '@angular/core';
import {
  AgentId,
  AgentState,
  AgentStatus,
  SPECIALIST_IDS,
} from '../types/agent.types';
import {
  Citation,
  DynamicComponentConfig,
  WidgetEntry,
} from '../types/widget.types';

type WidgetMap = Record<WidgetEntry['id'], WidgetEntry | undefined>;
type AgentStateMap = Record<AgentId, AgentState>;

const initialAgentStates = (): AgentStateMap => ({
  planner: { id: 'planner', status: 'idle' },
  budget: { id: 'budget', status: 'idle' },
  schedule: { id: 'schedule', status: 'idle' },
  venue: { id: 'venue', status: 'idle' },
});

const initialWidgets = (): WidgetMap => ({
  budget: undefined,
  schedule: undefined,
  venue: undefined,
});

export type GlobalStatus = 'idle' | 'planning' | 'running' | 'done' | 'error';

@Injectable({ providedIn: 'root' })
export class AgentStore {
  readonly widgets = signal<WidgetMap>(initialWidgets());
  readonly agentStates = signal<AgentStateMap>(initialAgentStates());
  readonly plannerRationale = signal<string | null>(null);

  readonly globalStatus = computed<GlobalStatus>(() => {
    const states = this.agentStates();

    if (states.planner.status === 'thinking' || states.planner.status === 'streaming') {
      return 'planning';
    }

    const specialists = SPECIALIST_IDS.map((id) => states[id]);
    const anyRunning = specialists.some((a) =>
      a.status === 'pending' || a.status === 'thinking' || a.status === 'streaming',
    );
    if (anyRunning) return 'running';

    const allIdle =
      states.planner.status === 'idle' && specialists.every((a) => a.status === 'idle');
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

  /**
   * Insert or replace a widget. The generation counter increments on every
   * call so the renderer can detect refines and trigger its pulse animation.
   */
  upsertWidget(input: {
    id: WidgetEntry['id'];
    payload: DynamicComponentConfig;
    citations?: Citation[];
  }): WidgetEntry {
    const next: WidgetEntry = {
      id: input.id,
      agentId: input.id,
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

  /**
   * Update an agent's lifecycle status. `startedAt` is captured the first
   * time the agent enters an active phase (thinking/streaming) so the
   * Control Tower can show a stable elapsed duration.
   */
  setAgentStatus(id: AgentId, status: AgentStatus, error?: string): void {
    this.agentStates.update((state) => {
      const current = state[id];
      const isActive = status === 'thinking' || status === 'streaming';
      const startedAt =
        isActive && current.startedAt === undefined
          ? Date.now()
          : current.startedAt;
      const completedAt =
        status === 'done' || status === 'error' ? Date.now() : current.completedAt;
      return {
        ...state,
        [id]: { ...current, status, error, startedAt, completedAt },
      };
    });
  }

  setPlannerRationale(text: string): void {
    this.plannerRationale.set(text);
  }

  resetForRun(): void {
    this.widgets.set(initialWidgets());
    this.agentStates.set(initialAgentStates());
    this.plannerRationale.set(null);
  }
}
