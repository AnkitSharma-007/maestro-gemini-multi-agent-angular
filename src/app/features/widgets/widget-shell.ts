import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AgentStore } from '../../core/state/agent.store';
import { AgentStatus, SpecialistId } from '../../core/types/agent.types';
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
  imports: [MatIconModule, MatProgressBarModule, RefineBar],
  templateUrl: './widget-shell.html',
  styleUrl: './widget-shell.scss',
  host: {
    '[class.shell-mode-ghost]': 'mode() === "ghost"',
    '[class.shell-mode-real]': 'mode() === "real"',
    '[class.shell-mode-error]': 'mode() === "error"',
    '[class.shell-pulse]': 'pulsing()',
    '[class.shell-streaming]': 'isStreaming()',
  },
})
export class WidgetShell {
  private readonly store = inject(AgentStore);

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
  }

  private firePulse(): void {
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulsing.set(true);
    this.pulseTimer = setTimeout(() => this.pulsing.set(false), 700);
  }
}
