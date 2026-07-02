import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { ApiKeyService } from '../../core/auth/api-key.service';
import { toAppError } from '../../core/errors/app-error';
import { NotificationService } from '../../core/errors/notification.service';
import { AgentStore } from '../../core/state/agent.store';
import { PromptDraftService } from '../../core/state/prompt-draft.service';
import {
  HERO_PROMPT,
  SAMPLE_PROMPTS,
  type SamplePrompt,
} from '../../core/demo/sample-prompts';
import { MissingApiKeyError } from '../../core/types/agent.types';

@Component({
  selector: 'dea-command-center',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './command-center.html',
  styleUrl: './command-center.scss',
})
export class CommandCenter {
  private readonly orchestrator = inject(AgentOrchestrator);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly store = inject(AgentStore);
  private readonly notifications = inject(NotificationService);
  private readonly drafts = inject(PromptDraftService);

  protected readonly prompt = signal<string>('');
  protected readonly heroPrompt = HERO_PROMPT;
  protected readonly samplePrompts = SAMPLE_PROMPTS;

  protected readonly hasKey = this.apiKeys.hasKey;
  protected readonly globalStatus = this.store.globalStatus;
  protected readonly isBusy = this.store.isBusy;

  protected readonly canSubmit = computed(
    () => this.hasKey() && !this.isBusy() && this.prompt().trim().length > 0,
  );

  constructor() {
    effect(() => {
      const draft = this.drafts.draft();
      if (!draft || this.isBusy()) return;
      this.prompt.set(draft);
      this.drafts.consume();
    });
  }

  protected applyHero(): void {
    if (this.isBusy()) return;
    this.prompt.set(this.heroPrompt);
  }

  protected applySample(sample: SamplePrompt): void {
    if (this.isBusy()) return;
    this.prompt.set(sample.prompt);
  }

  protected clearPrompt(): void {
    if (this.isBusy()) return;
    this.prompt.set('');
  }

  protected readonly charCount = computed(() => this.prompt().length);

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const text = this.prompt().trim();
    try {
      await this.orchestrator.run(text);
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      this.notifications.errorFrom(toAppError(err));
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void this.submit();
    }
  }
}
