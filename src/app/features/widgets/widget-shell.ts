import {
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
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
  private readonly destroyRef = inject(DestroyRef);

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

  /**
   * A widget that already rendered but whose latest refine/ripple/self-heal
   * failed: keep the previous content visible, but surface the failure inline
   * (otherwise it silently keeps a "Done" pill on stale data).
   */
  protected readonly hasInlineError = computed(
    () => this.mode() === 'real' && this.status() === 'error' && !!this.appError(),
  );

  protected readonly confidence = computed(() =>
    this.store.getWidgetConfidence(this.widgetId()),
  );

  protected readonly confidenceTier = computed<'high' | 'medium' | 'low' | null>(() => {
    const c = this.confidence();
    if (!c) return null;
    if (c.confidence >= 0.8) return 'high';
    if (c.confidence >= 0.6) return 'medium';
    return 'low';
  });

  protected readonly confidencePct = computed(() => {
    const c = this.confidence();
    return c ? Math.round(c.confidence * 100) : null;
  });

  protected readonly confidenceIcon = computed(() => {
    switch (this.confidenceTier()) {
      case 'high':
        return 'verified';
      case 'medium':
        return 'insights';
      case 'low':
        return 'auto_fix_high';
      default:
        return '';
    }
  });

  protected readonly confidenceTooltip = computed(() => {
    const c = this.confidence();
    if (!c) return '';
    const weaknesses = c.weaknesses.filter((w) => w.trim().length > 0);
    const head = `Quality confidence: ${Math.round(c.confidence * 100)}%`;
    return weaknesses.length ? `${head}\n• ${weaknesses.join('\n• ')}` : head;
  });

  /** Any pipeline activity — a ripple update now would abort in-flight work. */
  protected readonly busy = this.store.isBusy;

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

    this.destroyRef.onDestroy(() => {
      if (this.pulseTimer) clearTimeout(this.pulseTimer);
    });
  }

  private firePulse(): void {
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulsing.set(true);
    this.pulseTimer = setTimeout(() => this.pulsing.set(false), 700);
  }

  protected async updateFromRipple(): Promise<void> {
    if (this.busy()) return;
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
