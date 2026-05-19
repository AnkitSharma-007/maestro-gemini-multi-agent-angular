import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { ApiKeyService } from '../../core/auth/api-key.service';
import { AgentStore } from '../../core/state/agent.store';
import { classifyApiError, MissingApiKeyError } from '../../core/types/agent.types';

const HERO_PROMPT = `Plan a 3-day, 1,200-attendee Agentic AI conference in Bengaluru in March 2026, INR ₹2.5 crore budget, with hands-on workshops on multi-agent orchestration and a closing fireside.`;

interface SamplePrompt {
  icon: string;
  label: string;
  prompt: string;
}

const SAMPLE_PROMPTS: SamplePrompt[] = [
  {
    icon: 'rocket_launch',
    label: 'Product launch',
    prompt:
      'Plan a 1-day product launch in San Francisco for 400 press and partners next April, USD $180k budget, with a 90-minute keynote, a hands-on demo lounge, and an evening rooftop reception.',
  },
  {
    icon: 'school',
    label: 'Developer summit',
    prompt:
      'Plan a 2-day developer summit for 600 engineers in Berlin this October, EUR €420k budget, with two parallel tracks on AI infrastructure and platform engineering, plus a Friday night networking dinner.',
  },
  {
    icon: 'celebration',
    label: 'Founders retreat',
    prompt:
      'Plan a 4-day intimate founders retreat in Bali for 50 invitees in November, USD $260k budget, mixing strategy workshops, surf sessions, and a closing dinner at a private villa.',
  },
];

@Component({
  selector: 'dea-command-center',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  private readonly snack = inject(MatSnackBar);

  protected readonly prompt = signal<string>('');
  protected readonly heroPrompt = HERO_PROMPT;
  protected readonly samplePrompts = SAMPLE_PROMPTS;

  protected readonly hasKey = this.apiKeys.hasKey;
  protected readonly globalStatus = this.store.globalStatus;
  protected readonly isBusy = this.store.isBusy;

  protected readonly canSubmit = computed(
    () => this.hasKey() && !this.isBusy() && this.prompt().trim().length > 0,
  );

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
        this.notify('Please connect a Gemini API key first.', 'warn');
        return;
      }
      const cls = classifyApiError(err);
      const msg =
        err instanceof Error ? err.message : 'Something went wrong dispatching the agents.';
      this.notify(`${cls === 'auth' ? 'Auth: ' : ''}${msg}`, 'error');
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void this.submit();
    }
  }

  private notify(message: string, kind: 'warn' | 'error'): void {
    this.snack.open(message, 'Dismiss', {
      duration: 6000,
      panelClass: [`dea-snack-${kind}`],
    });
  }
}
