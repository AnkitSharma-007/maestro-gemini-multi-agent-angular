import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playDemoRun, type DemoNotifier } from './demo-script';
import { DEMO_RUN } from './demo-script.data';
import { DemoAbortedError, type DemoScheduler } from './demo-timeline';
import { AgentStore } from '../state/agent.store';
import { SPECIALIST_IDS } from '../types/agent.types';

/** Instant scheduler — the timing engine is covered in demo-timeline.spec. */
const instant: DemoScheduler = { wait: () => Promise.resolve() };
const silentNotify: DemoNotifier = { info: vi.fn() };

describe('playDemoRun', () => {
  let store: AgentStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(AgentStore);
    store.resetForRun();
  });

  it('drives a full run into the store and completes', async () => {
    await playDemoRun({
      store,
      data: DEMO_RUN,
      timeline: instant,
      model: DEMO_RUN.model,
      notify: silentNotify,
    });

    // Planner
    expect(store.agentStates().planner.status).toBe('done');
    expect(store.plannerRationale()).toBeTruthy();

    // Every specialist rendered a widget and finished
    for (const id of SPECIALIST_IDS) {
      expect(store.agentStates()[id].status).toBe('done');
      expect(store.getWidget(id), `widget ${id} missing`).toBeDefined();
    }
    expect(store.hasContent()).toBe(true);

    // Auditor produced a result
    expect(store.agentStates().auditor.status).toBe('done');
    expect(store.auditSummary()).toBeTruthy();

    // Telemetry accrued and the wall clock closed
    expect(store.runTelemetryTotals().totalTokens).toBeGreaterThan(0);
    expect(store.runWallEndedAt()).not.toBeNull();

    // Run is no longer busy → globalStatus settled to "done"
    expect(store.isBusy()).toBe(false);
    expect(store.globalStatus()).toBe('done');
  });

  it('carries grounding citations onto the grounded widgets', async () => {
    await playDemoRun({
      store,
      data: DEMO_RUN,
      timeline: instant,
      model: DEMO_RUN.model,
      notify: silentNotify,
    });

    expect((store.getWidget('schedule')?.citations?.length ?? 0)).toBeGreaterThan(0);
    expect((store.getWidget('venue')?.citations?.length ?? 0)).toBeGreaterThan(0);
  });

  it('self-heals the flagged budget: re-renders, restores confidence, toasts', async () => {
    const notify = { info: vi.fn() };
    await playDemoRun({
      store,
      data: DEMO_RUN,
      timeline: instant,
      model: DEMO_RUN.model,
      notify,
    });

    // Budget was upserted twice (initial + heal) → generation bump drives the pulse.
    expect(store.getWidget('budget')?.generation).toBe(2);

    // Re-audit left it clean with high budget confidence.
    expect(store.auditIssues()).toHaveLength(0);
    expect(store.getWidgetConfidence('budget')?.confidence).toBeGreaterThanOrEqual(0.8);

    // A single before → after toast, matching the real self-heal copy.
    expect(notify.info).toHaveBeenCalledTimes(1);
    expect(notify.info).toHaveBeenCalledWith('Auto-repaired Budget 55% → 90%');
  });

  it('stops when the scheduler aborts', async () => {
    const aborting: DemoScheduler = { wait: () => Promise.reject(new DemoAbortedError()) };
    await expect(
      playDemoRun({
        store,
        data: DEMO_RUN,
        timeline: aborting,
        model: DEMO_RUN.model,
        notify: silentNotify,
      }),
    ).rejects.toBeInstanceOf(DemoAbortedError);

    // The planner started but nothing rendered before the abort.
    expect(store.hasContent()).toBe(false);
  });
});
