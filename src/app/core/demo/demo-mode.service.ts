import { inject, Service, signal } from '@angular/core';
import { NotificationService } from '../errors/notification.service';
import { AgentStore } from '../state/agent.store';
import { PromptDraftService } from '../state/prompt-draft.service';
import { DemoAbortedError, DemoTimeline } from './demo-timeline';

export type DemoPhase = 'idle' | 'playing' | 'complete';

/** Playback speed under `prefers-reduced-motion`: fast-forward, don't linger. */
const REDUCED_MOTION_SCALE = 0.12;

/**
 * Beat between seeding the brief and spinning up the agents. It lets the Command
 * Center render the "typed" brief first — as a real user would — so the input box
 * is never populated mid-run while the agents are already working.
 */
const INTRO_BEAT_MS = 600;

/**
 * Owns the keyless "Watch a sample run" experience. It drives the real workspace
 * UI from a scripted replay of `AgentStore` — no Gemini call, no API key, no cost.
 *
 * `start()` clears the store, lazy-loads the canned run + choreography (so neither
 * lands in the initial bundle), and plays the timeline against an `AbortController`
 * that `stop()`/`replay()`/navigation cancels. The self-heal beat and interactive
 * guards arrive in later phases.
 */
@Service()
export class DemoModeService {
  private readonly store = inject(AgentStore);
  private readonly drafts = inject(PromptDraftService);
  private readonly notify = inject(NotificationService);

  private readonly _active = signal(false);
  private readonly _phase = signal<DemoPhase>('idle');

  /** True while the workspace is showing the keyless sample run. */
  readonly active = this._active.asReadonly();
  /** Playback phase, used by the demo banner to switch copy/controls. */
  readonly phase = this._phase.asReadonly();

  private controller: AbortController | null = null;

  /** Enter demo mode and begin the scripted run. */
  start(): void {
    void this.beginRun();
  }

  /**
   * Exit demo mode, leaving a clean workspace behind. Safe to call repeatedly.
   * Pass `keepBrief` on the conversion path (Connect key → run for real) so the
   * sample brief stays prefilled in the Command Center for a one-click real run.
   */
  stop(opts?: { keepBrief?: boolean }): void {
    if (!this._active() && this._phase() === 'idle') return;
    this.cancel();
    this._active.set(false);
    this._phase.set('idle');
    // Drop any brief the demo seeded so it never lingers — unless we're handing
    // the visitor straight into a real run of the same brief.
    if (!opts?.keepBrief) this.drafts.set('');
    this.store.resetForRun();
  }

  /** Restart the scripted run from the top. */
  replay(): void {
    this.stop();
    this.start();
  }

  private async beginRun(): Promise<void> {
    // E1: never stomp a real run in flight (e.g. a key user deep-linking
    // `?demo=1` mid-run). The demo takes exclusive ownership of the store, so
    // refuse until the pipeline is idle rather than corrupting live results.
    if (this.store.isBusy()) {
      this.notify.warn('Finish the current run before starting the sample run.');
      return;
    }

    // Take ownership of the store from a clean slate, discarding any prior run.
    this.cancel();
    this.store.resetForRun();
    this._active.set(true);
    this._phase.set('playing');

    const controller = new AbortController();
    this.controller = controller;

    try {
      const [{ playDemoRun }, { DEMO_RUN }] = await Promise.all([
        import('./demo-script'),
        import('./demo-script.data'),
      ]);

      // A late cancel (e.g. Exit clicked during the lazy import) short-circuits.
      if (controller.signal.aborted) return;

      // Show the brief in the Command Center first — as if the user typed it —
      // and let it render before the agents start, so it never appears mid-run.
      this.drafts.set(DEMO_RUN.intent);

      const timeline = new DemoTimeline(this.speedScale(), controller.signal);
      await timeline.wait(INTRO_BEAT_MS);

      await playDemoRun({
        store: this.store,
        data: DEMO_RUN,
        timeline,
        model: DEMO_RUN.model,
        notify: this.notify,
      });

      if (!controller.signal.aborted) this._phase.set('complete');
    } catch (err) {
      // Aborts are expected (cancel/replay/navigation); anything else is a real bug.
      if (!(err instanceof DemoAbortedError)) throw err;
    }
  }

  private cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }

  private speedScale(): number {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduce ? REDUCED_MOTION_SCALE : 1;
  }
}
