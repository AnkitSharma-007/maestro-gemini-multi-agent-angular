import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { AgentStore } from '../../core/state/agent.store';
import { SpecialistId } from '../../core/types/agent.types';

@Component({
  selector: 'dea-refine-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
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

  readonly widgetId = input.required<SpecialistId>();

  protected readonly expanded = signal<boolean>(false);
  protected readonly draft = signal<string>('');

  protected readonly status = computed(
    () => this.store.agentStates()[this.widgetId()].status,
  );

  protected readonly inFlight = computed(() => {
    const s = this.status();
    return s === 'thinking' || s === 'streaming' || s === 'pending';
  });

  protected expand(): void {
    if (this.inFlight()) return;
    this.expanded.set(true);
  }

  protected collapse(): void {
    this.expanded.set(false);
    this.draft.set('');
  }

  protected async apply(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.inFlight()) return;
    this.collapse();
    try {
      await this.orchestrator.refine(this.widgetId(), text);
    } catch {
      /* errors surface via agent state */
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
