import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { disabled, form, FormField, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import {
  INTAKE_ACCEPT,
  IntakeService,
  IntakeValidationError,
} from '../../core/ai/intake/intake.service';
import { ApiKeyService } from '../../core/auth/api-key.service';
import { toAppError } from '../../core/errors/app-error';
import { NotificationService } from '../../core/errors/notification.service';
import { DemoModeService } from '../../core/demo/demo-mode.service';
import { AgentStore } from '../../core/state/agent.store';
import { PromptDraftService } from '../../core/state/prompt-draft.service';
import {
  HERO_PROMPT,
  SAMPLE_PROMPTS,
  type SamplePrompt,
} from '../../core/demo/sample-prompts';
import { MissingApiKeyError } from '../../core/types/agent.types';

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

@Component({
  selector: 'dea-command-center',
  imports: [
    FormField,
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
  private readonly intake = inject(IntakeService);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly store = inject(AgentStore);
  private readonly notifications = inject(NotificationService);
  private readonly drafts = inject(PromptDraftService);
  private readonly demo = inject(DemoModeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly prompt = signal<string>('');
  protected readonly heroPrompt = HERO_PROMPT;
  protected readonly samplePrompts = SAMPLE_PROMPTS;
  protected readonly accept = INTAKE_ACCEPT;

  protected readonly hasKey = this.apiKeys.hasKey;
  protected readonly globalStatus = this.store.globalStatus;
  protected readonly isBusy = this.store.isBusy;
  /** Keyless sample run owns the store — all authoring/dispatch is locked. */
  protected readonly demoActive = this.demo.active;

  protected readonly interpreting = signal<boolean>(false);
  protected readonly attachmentName = signal<string | null>(null);
  protected readonly listening = signal<boolean>(false);
  protected readonly voiceSupported = speechRecognitionCtor() !== null;

  /** Guardrail against pasting an entire document straight into the Planner. */
  protected readonly maxPromptChars = 4000;

  /**
   * Signal Forms field over the brief. The schema enforces the length cap (which also
   * drives the native maxlength) and disables the control while a run is in flight.
   */
  protected readonly promptField = form(this.prompt, (p) => {
    maxLength(p, this.maxPromptChars);
    disabled(p, { when: () => this.isBusy() || this.demoActive() });
  });

  private recognition: SpeechRecognitionLike | null = null;

  protected readonly charCount = computed(() => this.prompt().length);
  protected readonly overLimit = computed(() => this.charCount() > this.maxPromptChars);
  protected readonly nearLimit = computed(
    () => !this.overLimit() && this.charCount() >= this.maxPromptChars * 0.9,
  );

  protected readonly canSubmit = computed(
    () =>
      this.hasKey() &&
      !this.isBusy() &&
      !this.demoActive() &&
      !this.interpreting() &&
      !this.overLimit() &&
      this.prompt().trim().length > 0,
  );

  constructor() {
    effect(() => {
      const draft = this.drafts.draft();
      // A real in-flight run must keep its brief untouched, but the keyless demo
      // owns the store and deliberately prefills the brief as it starts (which
      // immediately marks the store busy) — so don't block the demo's prefill.
      if (!draft || (this.isBusy() && !this.demoActive())) return;
      this.prompt.set(draft);
      this.drafts.consume();
    });

    // Never leave the microphone live after the component goes away.
    this.destroyRef.onDestroy(() => this.stopVoice());
  }

  protected applyHero(): void {
    if (this.isBusy() || this.demoActive()) return;
    this.prompt.set(this.heroPrompt);
  }

  protected applySample(sample: SamplePrompt): void {
    if (this.isBusy() || this.demoActive()) return;
    this.prompt.set(sample.prompt);
  }

  protected clearPrompt(): void {
    if (this.isBusy() || this.demoActive()) return;
    this.prompt.set('');
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.stopVoice();
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

  /** Turn an attached image/PDF into an editable draft brief (confirm before running). */
  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file || this.isBusy() || this.demoActive() || this.interpreting()) return;

    this.attachmentName.set(file.name);
    this.interpreting.set(true);
    try {
      const brief = await this.intake.briefFromFile(file);
      this.prompt.set(brief);
    } catch (err) {
      this.attachmentName.set(null);
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      if (err instanceof IntakeValidationError) {
        this.notifications.error(err.message);
        return;
      }
      this.notifications.errorFrom(toAppError(err));
    } finally {
      this.interpreting.set(false);
    }
  }

  protected toggleVoice(): void {
    if (this.listening()) {
      this.stopVoice();
    } else {
      this.startVoice();
    }
  }

  private startVoice(): void {
    if (this.isBusy() || this.demoActive() || this.interpreting()) return;
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      this.notifications.info(
        'Voice input is not supported in this browser. Try Chrome or Edge.',
      );
      return;
    }

    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (event) => this.appendTranscript(event);
    rec.onerror = (event) => this.onVoiceError(event.error);
    rec.onend = () => this.listening.set(false);

    this.recognition = rec;
    this.listening.set(true);
    rec.start();
  }

  /** Surface actionable voice failures; stay quiet on benign ones. */
  private onVoiceError(code: string): void {
    this.listening.set(false);
    this.recognition = null;
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        this.notifications.warn(
          'Microphone access is blocked. Allow mic permission in your browser to dictate.',
        );
        break;
      case 'audio-capture':
        this.notifications.warn('No microphone was found for voice input.');
        break;
      case 'network':
        this.notifications.error('Voice recognition failed due to a network problem.');
        break;
      // 'no-speech' and 'aborted' are benign — no toast.
    }
  }

  private stopVoice(): void {
    this.recognition?.stop();
    this.recognition = null;
    this.listening.set(false);
  }

  private appendTranscript(event: SpeechRecognitionEventLike): void {
    let chunk = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) chunk += result[0].transcript;
    }
    chunk = chunk.trim();
    if (!chunk) return;
    const existing = this.prompt();
    const separator = existing && !existing.endsWith(' ') ? ' ' : '';
    // Dictation bypasses the textarea's maxlength, so cap it here too.
    const next = (existing + separator + chunk).trimStart().slice(0, this.maxPromptChars);
    this.prompt.set(next);
  }
}
