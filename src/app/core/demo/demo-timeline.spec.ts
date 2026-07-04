import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoAbortedError, DemoTimeline, sleep } from './demo-timeline';

interface FakeDoc {
  hidden: boolean;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
  setHidden(hidden: boolean): void;
}

function fakeDoc(hidden = false): FakeDoc {
  const listeners = new Map<string, Set<() => void>>();
  return {
    hidden,
    addEventListener(type, cb) {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(cb);
    },
    removeEventListener(type, cb) {
      listeners.get(type)?.delete(cb);
    },
    setHidden(next) {
      this.hidden = next;
      listeners.get('visibilitychange')?.forEach((cb) => cb());
    },
  };
}

describe('sleep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the delay', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let done = false;
    void sleep(100, controller.signal).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('rejects with DemoAbortedError when aborted mid-flight', async () => {
    const controller = new AbortController();
    const p = sleep(1000, controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(DemoAbortedError);
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toBeInstanceOf(DemoAbortedError);
  });

  it('pauses while the document is hidden and resumes when visible', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const doc = fakeDoc(false);
    let done = false;
    void sleep(100, controller.signal, { doc }).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(60); // 40ms remaining
    doc.setHidden(true); // pause
    await vi.advanceTimersByTimeAsync(5000); // long background — must not fire
    expect(done).toBe(false);

    doc.setHidden(false); // resume with 40ms left
    await vi.advanceTimersByTimeAsync(39);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('does not start counting until the tab becomes visible', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const doc = fakeDoc(true); // hidden from the start
    let done = false;
    void sleep(50, controller.signal, { doc }).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(5000);
    expect(done).toBe(false);

    doc.setHidden(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(done).toBe(true);
  });
});

describe('DemoTimeline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('scales waits by the configured factor', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const timeline = new DemoTimeline(0.5, controller.signal);
    let done = false;
    void timeline.wait(200).then(() => (done = true)); // 200 * 0.5 = 100ms

    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
