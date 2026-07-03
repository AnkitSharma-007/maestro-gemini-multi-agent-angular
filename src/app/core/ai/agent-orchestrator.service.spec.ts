import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { AgentStore } from '../state/agent.store';
import { ApiKeyService } from '../auth/api-key.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from '../errors/notification.service';
import { PlannerAgent } from './agents/planner.agent';
import { BudgetAgent } from './agents/budget.agent';
import { ScheduleAgent } from './agents/schedule.agent';
import { VenueAgent } from './agents/venue.agent';
import { AuditorAgent } from './agents/auditor.agent';
import type { AuditorOutput, PlannerOutput, WidgetConfidence } from '../types/agent.types';

function notificationsMock(): NotificationService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    errorFrom: vi.fn(),
  } as unknown as NotificationService;
}

function settingsMock(autoHeal: WritableSignal<boolean>): SettingsService {
  return {
    autoHeal,
    setAutoHeal: (v: boolean) => autoHeal.set(v),
    toggleAutoHeal: () => autoHeal.set(!autoHeal()),
  } as unknown as SettingsService;
}

const budgetResult = { title: 'B', totalBudget: 100, currency: 'USD', lineItems: [] };
const scheduleResult = { title: 'S', days: [] };
const venueResult = {
  title: 'V',
  name: 'Acme',
  city: 'Bengaluru',
  capacity: 1000,
  amenities: [],
  estimatedCost: 200000,
  currency: 'INR',
  rationale: 'r',
};

function plan(): PlannerOutput {
  return {
    rationale: 'r',
    agents: [
      { id: 'budget', brief: 'b', needed: true },
      { id: 'schedule', brief: 's', needed: true },
      { id: 'venue', brief: 'v', needed: true },
    ],
  };
}

function auditorOutput(confidence: WidgetConfidence[]): AuditorOutput {
  return { summary: '', issues: [], confidence };
}

describe('AgentOrchestrator self-heal', () => {
  let store: AgentStore;
  let budget: { run: ReturnType<typeof vi.fn> };
  let schedule: { run: ReturnType<typeof vi.fn> };
  let venue: { run: ReturnType<typeof vi.fn> };
  let auditor: { run: ReturnType<typeof vi.fn> };
  let autoHeal: WritableSignal<boolean>;
  let notifications: NotificationService;

  function configure(auditorRun: () => Promise<{ value: AuditorOutput }>): AgentOrchestrator {
    budget = { run: vi.fn(async () => ({ value: budgetResult })) };
    schedule = { run: vi.fn(async () => ({ value: scheduleResult })) };
    venue = { run: vi.fn(async () => ({ value: venueResult })) };
    auditor = { run: vi.fn(auditorRun) };
    autoHeal = signal(true);
    notifications = notificationsMock();

    const apiKeys = {
      hasKey: signal(true),
      key: signal('test-key'),
      model: () => 'gemini-3.5-flash',
    } as unknown as ApiKeyService;

    const planner = { plan: vi.fn(async () => plan()) } as unknown as PlannerAgent;

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiKeyService, useValue: apiKeys },
        { provide: SettingsService, useValue: settingsMock(autoHeal) },
        { provide: NotificationService, useValue: notifications },
        { provide: PlannerAgent, useValue: planner },
        { provide: BudgetAgent, useValue: budget },
        { provide: ScheduleAgent, useValue: schedule },
        { provide: VenueAgent, useValue: venue },
        { provide: AuditorAgent, useValue: auditor },
      ],
    });

    store = TestBed.inject(AgentStore);
    return TestBed.inject(AgentOrchestrator);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('re-runs a low-confidence widget once, then re-audits', async () => {
    let call = 0;
    const orchestrator = configure(async () => {
      call += 1;
      const budgetScore = call === 1 ? 0.3 : 0.9;
      return {
        value: auditorOutput([
          { targetId: 'budget', confidence: budgetScore, weaknesses: ['add contingency'] },
          { targetId: 'schedule', confidence: 0.9, weaknesses: [] },
          { targetId: 'venue', confidence: 0.9, weaknesses: [] },
        ]),
      };
    });

    await orchestrator.run('plan something');

    // budget ran once for the initial plan + once for the repair.
    expect(budget.run).toHaveBeenCalledTimes(2);
    expect(schedule.run).toHaveBeenCalledTimes(1);
    expect(venue.run).toHaveBeenCalledTimes(1);
    // auditor ran the initial audit + one re-audit after healing.
    expect(auditor.run).toHaveBeenCalledTimes(2);
    expect(store.getWidgetConfidence('budget')?.confidence).toBe(0.9);
  });

  it('does not heal when every widget is already above the threshold', async () => {
    const orchestrator = configure(async () =>
      Promise.resolve({
        value: auditorOutput([
          { targetId: 'budget', confidence: 0.9, weaknesses: [] },
          { targetId: 'schedule', confidence: 0.85, weaknesses: [] },
          { targetId: 'venue', confidence: 0.95, weaknesses: [] },
        ]),
      }),
    );

    await orchestrator.run('plan something');

    expect(budget.run).toHaveBeenCalledTimes(1);
    expect(schedule.run).toHaveBeenCalledTimes(1);
    expect(venue.run).toHaveBeenCalledTimes(1);
    expect(auditor.run).toHaveBeenCalledTimes(1);
  });

  it('caps healing at one repair attempt even if the widget stays weak', async () => {
    const orchestrator = configure(async () =>
      Promise.resolve({
        value: auditorOutput([
          { targetId: 'budget', confidence: 0.2, weaknesses: ['still weak'] },
          { targetId: 'schedule', confidence: 0.9, weaknesses: [] },
          { targetId: 'venue', confidence: 0.9, weaknesses: [] },
        ]),
      }),
    );

    await orchestrator.run('plan something');

    // Initial + exactly one repair; not an unbounded loop.
    expect(budget.run).toHaveBeenCalledTimes(2);
    expect(auditor.run).toHaveBeenCalledTimes(2);
  });

  it('does not self-heal when the auto-repair setting is off (M5 consent)', async () => {
    const orchestrator = configure(async () =>
      Promise.resolve({
        value: auditorOutput([
          { targetId: 'budget', confidence: 0.2, weaknesses: ['weak'] },
          { targetId: 'schedule', confidence: 0.9, weaknesses: [] },
          { targetId: 'venue', confidence: 0.9, weaknesses: [] },
        ]),
      }),
    );
    autoHeal.set(false);

    await orchestrator.run('plan something');

    expect(budget.run).toHaveBeenCalledTimes(1); // no repair
    expect(auditor.run).toHaveBeenCalledTimes(1); // no re-audit
  });

  it('announces a heal with a before → after confidence toast (M5 visibility)', async () => {
    let call = 0;
    const orchestrator = configure(async () => {
      call += 1;
      return {
        value: auditorOutput([
          { targetId: 'budget', confidence: call === 1 ? 0.3 : 0.9, weaknesses: ['add contingency'] },
          { targetId: 'schedule', confidence: 0.9, weaknesses: [] },
          { targetId: 'venue', confidence: 0.9, weaknesses: [] },
        ]),
      };
    });

    await orchestrator.run('plan something');

    expect(notifications.info).toHaveBeenCalledTimes(1);
    const msg = (notifications.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(msg).toMatch(/auto-repaired/i);
    expect(msg).toContain('30%');
    expect(msg).toContain('90%');
  });
});

describe('AgentOrchestrator dispatch + busy gating', () => {
  let store: AgentStore;
  let budget: { run: ReturnType<typeof vi.fn> };
  let schedule: { run: ReturnType<typeof vi.fn> };
  let venue: { run: ReturnType<typeof vi.fn> };
  let auditor: { run: ReturnType<typeof vi.fn> };

  const cleanAudit = () =>
    Promise.resolve({
      value: auditorOutput([
        { targetId: 'budget', confidence: 0.9, weaknesses: [] },
        { targetId: 'schedule', confidence: 0.9, weaknesses: [] },
        { targetId: 'venue', confidence: 0.9, weaknesses: [] },
      ]),
    });

  function configurePlan(plannerOutput: PlannerOutput): AgentOrchestrator {
    // Mocks mimic the real agents' terminal status transition (→ 'done') so
    // globalStatus/isBusy reflect a settled pipeline.
    budget = {
      run: vi.fn(async () => {
        store.setAgentStatus('budget', 'done');
        return { value: budgetResult };
      }),
    };
    schedule = {
      run: vi.fn(async () => {
        store.setAgentStatus('schedule', 'done');
        return { value: scheduleResult };
      }),
    };
    venue = {
      run: vi.fn(async () => {
        store.setAgentStatus('venue', 'done');
        return { value: venueResult };
      }),
    };
    auditor = {
      run: vi.fn(async () => {
        store.setAgentStatus('auditor', 'done');
        return cleanAudit();
      }),
    };

    const apiKeys = {
      hasKey: signal(true),
      key: signal('test-key'),
      model: () => 'gemini-3.5-flash',
    } as unknown as ApiKeyService;

    const planner = {
      plan: vi.fn(async () => plannerOutput),
    } as unknown as PlannerAgent;

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiKeyService, useValue: apiKeys },
        { provide: SettingsService, useValue: settingsMock(signal(true)) },
        { provide: NotificationService, useValue: notificationsMock() },
        { provide: PlannerAgent, useValue: planner },
        { provide: BudgetAgent, useValue: budget },
        { provide: ScheduleAgent, useValue: schedule },
        { provide: VenueAgent, useValue: venue },
        { provide: AuditorAgent, useValue: auditor },
      ],
    });

    store = TestBed.inject(AgentStore);
    return TestBed.inject(AgentOrchestrator);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('never leaves a needed-but-empty-brief agent stuck "pending" (no busy lockup)', async () => {
    const orchestrator = configurePlan({
      rationale: 'r',
      agents: [
        { id: 'budget', brief: 'b', needed: true },
        // Needed, but the planner emitted a blank brief — must not be dispatched
        // and must not wedge the pipeline in a permanent busy state.
        { id: 'schedule', brief: '   ', needed: true },
        { id: 'venue', brief: 'v', needed: false },
      ],
    });

    await orchestrator.run('plan something');

    expect(budget.run).toHaveBeenCalledTimes(1);
    expect(schedule.run).not.toHaveBeenCalled();
    expect(venue.run).not.toHaveBeenCalled();

    // The un-dispatched agent stays idle rather than pending-forever…
    expect(store.agentStates().schedule.status).toBe('idle');
    // …so the pipeline settles and the UI is not locked in "busy".
    expect(store.isBusy()).toBe(false);
    expect(store.globalStatus()).toBe('done');
  });

  it('ignores a refine while the pipeline is busy (single-flight)', async () => {
    const orchestrator = configurePlan({
      rationale: 'r',
      agents: [{ id: 'budget', brief: 'b', needed: true }],
    });

    // Simulate an in-flight run.
    store.setAgentStatus('schedule', 'thinking');
    expect(store.isBusy()).toBe(true);

    await orchestrator.refine('budget', 'make it cheaper');

    expect(budget.run).not.toHaveBeenCalled();
  });

  it('ignores re-audit while the pipeline is busy', async () => {
    const orchestrator = configurePlan({
      rationale: 'r',
      agents: [{ id: 'budget', brief: 'b', needed: true }],
    });

    store.setAgentStatus('budget', 'thinking');
    expect(store.isBusy()).toBe(true);

    await orchestrator.reAudit();

    expect(auditor.run).not.toHaveBeenCalled();
  });

  it('clears a widget confidence after a successful manual refine (M1)', async () => {
    const orchestrator = configurePlan({
      rationale: 'r',
      agents: [{ id: 'budget', brief: 'b', needed: true }],
    });

    await orchestrator.run('x');
    expect(store.getWidgetConfidence('budget')?.confidence).toBe(0.9);

    await orchestrator.refine('budget', 'make it cheaper');

    expect(store.getWidgetConfidence('budget')).toBeUndefined();
    // Refine ran budget again (initial + refine).
    expect(budget.run).toHaveBeenCalledTimes(2);
  });

  it('re-dispatches specialists and re-audits when the planner is retried (M8)', async () => {
    const orchestrator = configurePlan({
      rationale: 'r',
      agents: [
        { id: 'budget', brief: 'b', needed: true },
        { id: 'venue', brief: 'v', needed: true },
      ],
    });

    await orchestrator.run('x');
    expect(budget.run).toHaveBeenCalledTimes(1);
    expect(venue.run).toHaveBeenCalledTimes(1);
    expect(auditor.run).toHaveBeenCalledTimes(1);

    await orchestrator.retryAgent('planner');

    // The re-plan actually re-ran the specialists and re-audited (not a no-op).
    expect(budget.run).toHaveBeenCalledTimes(2);
    expect(venue.run).toHaveBeenCalledTimes(2);
    expect(auditor.run).toHaveBeenCalledTimes(2);
  });
});
