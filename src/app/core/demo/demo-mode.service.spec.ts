import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoModeService } from './demo-mode.service';
import { NotificationService } from '../errors/notification.service';
import { AgentStore } from '../state/agent.store';
import { PromptDraftService } from '../state/prompt-draft.service';

/**
 * Covers the synchronous lifecycle guards (E1/E6 + keepBrief). The full scripted
 * playback is exercised in `demo-script.spec.ts`; here we `stop()` before the lazy
 * import resolves so no timeline runs. After a successful `start()`, we let that
 * fire-and-forget import settle (it bails on the aborted controller) so it never
 * races the environment teardown.
 */
async function settleLazyImport(): Promise<void> {
  await import('./demo-script');
  await import('./demo-script.data');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('DemoModeService', () => {
  let demo: DemoModeService;
  let store: AgentStore;
  let drafts: PromptDraftService;
  const notify = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() };

  beforeAll(async () => {
    // Warm the module cache so the service's internal import resolves promptly.
    await settleLazyImport();
  });

  beforeEach(() => {
    notify.warn.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: notify }],
    });
    demo = TestBed.inject(DemoModeService);
    store = TestBed.inject(AgentStore);
    drafts = TestBed.inject(PromptDraftService);
    store.resetForRun();
  });

  it('starts from an idle store and tears down cleanly', async () => {
    demo.start();
    expect(demo.active()).toBe(true);
    expect(demo.phase()).toBe('playing');

    demo.stop();
    expect(demo.active()).toBe(false);
    expect(demo.phase()).toBe('idle');
    await settleLazyImport();
  });

  it('refuses to start while a real run is in flight (E1)', () => {
    store.setAgentStatus('planner', 'thinking');
    expect(store.isBusy()).toBe(true);

    demo.start();

    expect(demo.active()).toBe(false);
    expect(demo.phase()).toBe('idle');
    expect(notify.warn).toHaveBeenCalledTimes(1);
  });

  it('stop() is a no-op when already idle', () => {
    expect(() => demo.stop()).not.toThrow();
    expect(demo.active()).toBe(false);
    expect(demo.phase()).toBe('idle');
  });

  it('keeps the seeded brief on the convert path, clears it on a plain exit', async () => {
    demo.start();
    drafts.set('a seeded demo brief');
    demo.stop({ keepBrief: true });
    expect(drafts.draft()).toBe('a seeded demo brief');

    demo.start();
    drafts.set('another seeded brief');
    demo.stop();
    expect(drafts.draft()).toBe('');
    await settleLazyImport();
  });
});
