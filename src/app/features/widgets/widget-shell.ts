import {
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { toAppError } from '../../core/errors/app-error';
import { NotificationService } from '../../core/errors/notification.service';
import { AgentStore } from '../../core/state/agent.store';
import {
  AgentStatus,
  MissingApiKeyError,
  SPECIALIST_META,
  SpecialistId,
} from '../../core/types/agent.types';
import { RefineBar } from './refine-bar';

type ShellMode = 'ghost' | 'real' | 'error';

@Component({
  selector: 'dea-widget-shell',
  encapsulation: ViewEncapsulation.None,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule, RefineBar],
  templateUrl: './widget-shell.html',
  styleUrl: './widget-shell.scss',
  host: {
    '[class.shell-mode-ghost]': 'mode() === "ghost"',
    '[class.shell-mode-error]': 'mode() === "error"',
    '[class.shell-pulse]': 'pulsing()',
    '[class.shell-stale]': 'mode() === "real" && isStale()',
  },
})
export class WidgetShell {
  private readonly store = inject(AgentStore);
  private readonly orchestrator = inject(AgentOrchestrator);
  private readonly notifications = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly mode = input.required<ShellMode>();
  readonly widgetId = input.required<SpecialistId>();
  readonly title = input<string | undefined>(undefined);

  protected readonly meta = computed(() => SPECIALIST_META[this.widgetId()]);

  protected readonly status = computed<AgentStatus>(
    () => this.store.agentStates()[this.widgetId()].status,
  );

  protected readonly isStreaming = computed(
    () => this.status() === 'thinking' || this.status() === 'streaming',
  );

  protected readonly isStale = computed(() =>
    this.store.staleWidgets().includes(this.widgetId()),
  );

  protected readonly appError = computed(
    () => this.store.agentStates()[this.widgetId()].error ?? null,
  );

  protected readonly canRetry = computed(
    () =>
      (this.appError()?.retryable ?? false) &&
      !this.store.isBusy() &&
      !!this.store.getAgentBrief(this.widgetId()),
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
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      this.notifications.errorFrom(toAppError(err));
    }
  }

  protected async retry(): Promise<void> {
    if (this.store.isBusy()) return;
    try {
      await this.orchestrator.retryAgent(this.widgetId());
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      this.notifications.errorFrom(toAppError(err));
    }
  }
}
