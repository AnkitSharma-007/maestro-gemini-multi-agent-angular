/**
 * Tiny cancelable scheduler for the demo replay (DEMO_MODE_IMPLEMENTATION_PLAN
 * §3.2). It is deliberately framework-free so it is trivial to unit test:
 *
 *  - `sleep()` resolves after a delay, rejects with `DemoAbortedError` on abort,
 *    and — crucially — *pauses while the tab is hidden* so a backgrounded demo
 *    doesn't fire a clump of beats when the user returns (edge case E5).
 *  - `DemoTimeline` wraps `sleep` with a speed `scale` (1 = normal; a small factor
 *    under `prefers-reduced-motion`, edge case E4) and a shared abort signal.
 */

export class DemoAbortedError extends Error {
  constructor() {
    super('Demo run aborted.');
    this.name = 'DemoAbortedError';
  }
}

export interface DemoScheduler {
  wait(ms: number): Promise<void>;
}

/** The slim slice of `document` the scheduler needs — keeps it easy to fake. */
export interface VisibilityDoc {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

interface SleepDeps {
  /** Injectable for tests; defaults to the ambient document (undefined in SSR). */
  doc?: VisibilityDoc;
}

/** Resolve after `ms` of *visible* time; reject if `signal` aborts. */
export function sleep(ms: number, signal: AbortSignal, deps: SleepDeps = {}): Promise<void> {
  const doc =
    deps.doc ?? (typeof document !== 'undefined' ? (document as VisibilityDoc) : undefined);

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DemoAbortedError());
      return;
    }

    let remaining = Math.max(0, ms);
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const cleanup = (): void => {
      clearTimer();
      signal.removeEventListener('abort', onAbort);
      doc?.removeEventListener('visibilitychange', onVisibility);
    };

    const finish = (): void => {
      cleanup();
      resolve();
    };

    const startTimer = (): void => {
      startedAt = Date.now();
      timer = setTimeout(finish, remaining);
    };

    const pauseTimer = (): void => {
      clearTimer();
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
    };

    const onVisibility = (): void => {
      if (!doc) return;
      if (doc.hidden) pauseTimer();
      else if (timer === null) startTimer();
    };

    const onAbort = (): void => {
      cleanup();
      reject(new DemoAbortedError());
    };

    signal.addEventListener('abort', onAbort);
    doc?.addEventListener('visibilitychange', onVisibility);

    // Don't start counting down until the tab is actually visible.
    if (!doc || !doc.hidden) startTimer();
  });
}

export class DemoTimeline implements DemoScheduler {
  constructor(
    private readonly scale: number,
    readonly signal: AbortSignal,
    private readonly deps: SleepDeps = {},
  ) {}

  wait(ms: number): Promise<void> {
    return sleep(ms * this.scale, this.signal, this.deps);
  }
}
