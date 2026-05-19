import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { AgentStore } from '../../core/state/agent.store';
import {
  AgentStatus,
  MissingApiKeyError,
  SpecialistId,
} from '../../core/types/agent.types';
import { RefineBar } from './refine-bar';

export type ShellMode = 'ghost' | 'real' | 'error';

const SLOT_LABELS: Record<SpecialistId, { label: string; icon: string }> = {
  budget: { label: 'Budget', icon: 'payments' },
  schedule: { label: 'Schedule', icon: 'event_note' },
  venue: { label: 'Venue', icon: 'location_on' },
};

@Component({
  selector: 'dea-widget-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, RefineBar],
  templateUrl: './widget-shell.html',
  styleUrl: './widget-shell.scss',
  host: {
    '[class.shell-mode-ghost]': 'mode() === "ghost"',
    '[class.shell-mode-real]': 'mode() === "real"',
    '[class.shell-mode-error]': 'mode() === "error"',
    '[class.shell-pulse]': 'pulsing()',
    '[class.shell-streaming]': 'isStreaming()',
    '[class.shell-stale]': 'mode() === "real" && isStale()',
  },
})
export class WidgetShell {
  private readonly store = inject(AgentStore);
  private readonly orchestrator = inject(AgentOrchestrator);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly mode = input.required<ShellMode>();
  readonly widgetId = input.required<SpecialistId>();
  readonly title = input<string | undefined>(undefined);

  protected readonly meta = computed(() => SLOT_LABELS[this.widgetId()]);

  protected readonly status = computed<AgentStatus>(
    () => this.store.agentStates()[this.widgetId()].status,
  );

  protected readonly isStreaming = computed(
    () => this.status() === 'thinking' || this.status() === 'streaming',
  );

  protected readonly isStale = computed(() =>
    this.store.staleWidgets().includes(this.widgetId()),
  );

  protected readonly errorMessage = computed(
    () => this.store.agentStates()[this.widgetId()].error ?? null,
  );

  protected readonly pulsing = signal<boolean>(false);
  private lastSeenGeneration = 0;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const w = this.store.widgets()[this.widgetId()];
      if (!w) return;
      if (w.generation > this.lastSeenGeneration && this.lastSeenGeneration > 0) {
        this.firePulse();
      }
      this.lastSeenGeneration = w.generation;
    });

    // Real widgets are hosted inside OnPush parents (BudgetWidget, etc.) that
    // only markForCheck on generation bumps — re-check when ripple stale flips.
    effect(() => {
      this.isStale();
      this.cdr.markForCheck();
    });
  }

  private firePulse(): void {
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulsing.set(true);
    this.pulseTimer = setTimeout(() => this.pulsing.set(false), 700);
  }

  protected async updateFromRipple(): Promise<void> {
    if (this.isStreaming()) return;
    try {
      await this.orchestrator.rippleUpdate(this.widgetId());
    } catch (err) {
      if (err instanceof MissingApiKeyError) return;
    }
  }
}
