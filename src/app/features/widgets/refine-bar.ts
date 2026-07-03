import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { toAppError } from '../../core/errors/app-error';
import { NotificationService } from '../../core/errors/notification.service';
import { AgentStore } from '../../core/state/agent.store';
import { MissingApiKeyError, SpecialistId } from '../../core/types/agent.types';

@Component({
  selector: 'dea-refine-bar',
  imports: [
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './refine-bar.html',
  styleUrl: './refine-bar.scss',
})
export class RefineBar {
  private readonly orchestrator = inject(AgentOrchestrator);
  private readonly store = inject(AgentStore);
  private readonly notifications = inject(NotificationService);

  readonly widgetId = input.required<SpecialistId>();

  protected readonly expanded = signal<boolean>(false);
  protected readonly draft = signal<string>('');
  protected readonly draftField = form(this.draft);

  private readonly draftInput = viewChild<ElementRef<HTMLInputElement>>('draftInput');

  constructor() {
    effect(() => {
      const input = this.draftInput();
      if (input && this.expanded()) {
        input.nativeElement.focus();
      }
    });
  }

  protected readonly status = computed(
    () => this.store.agentStates()[this.widgetId()].status,
  );

  protected readonly inFlight = computed(() => {
    const s = this.status();
    return s === 'thinking' || s === 'streaming' || s === 'pending';
  });

  /** Any pipeline activity anywhere — refining now would abort in-flight work. */
  protected readonly busy = this.store.isBusy;

  /** Refine is unavailable while this widget or the pipeline is working. */
  protected readonly disabled = computed(() => this.inFlight() || this.busy());

  protected readonly triggerTooltip = computed(() => {
    if (this.inFlight()) return 'Agent is still working…';
    if (this.busy()) return 'Wait for the current run to finish';
    return 'Refine this widget';
  });

  protected expand(): void {
    if (this.disabled()) return;
    this.expanded.set(true);
  }

  protected collapse(): void {
    this.expanded.set(false);
    this.draft.set('');
  }

  protected async apply(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.disabled()) return;
    this.collapse();
    try {
      await this.orchestrator.refine(this.widgetId(), text);
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      // Agent-level failures already surface via agent state; this only
      // catches unexpected orchestration errors.
      this.notifications.errorFrom(toAppError(err));
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void this.apply();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.collapse();
    }
  }
}
