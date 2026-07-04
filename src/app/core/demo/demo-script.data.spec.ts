import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_RUN } from './demo-script.data';
import { SPECIALIST_IDS } from '../types/agent.types';
import { intoComponentConfig } from '../types/widget.types';
import { BudgetWidget } from '../../features/widgets/budget-widget';

const CONFIDENCE_THRESHOLD = 0.6; // mirrors AgentOrchestrator's self-heal gate

function sumLineItems(items: readonly { amount: number }[]): number {
  return items.reduce((acc, li) => acc + li.amount, 0);
}

describe('DEMO_RUN canned data', () => {
  it('uses the canonical hero brief', () => {
    expect(DEMO_RUN.intent.length).toBeGreaterThan(0);
    expect(DEMO_RUN.intent).toContain('Bengaluru');
  });

  it('flows each specialist result through intoComponentConfig unchanged', () => {
    const budget = intoComponentConfig('budget', DEMO_RUN.budget.result);
    expect(budget.type).toBe('render_budget');
    expect(budget.config).not.toHaveProperty('title');

    const schedule = intoComponentConfig('schedule', DEMO_RUN.schedule.result);
    expect(schedule.type).toBe('render_schedule');

    const venue = intoComponentConfig('venue', DEMO_RUN.venue.result);
    expect(venue.type).toBe('render_venue');
  });

  it('has a 3-day schedule and grounding citations on grounded agents', () => {
    expect(DEMO_RUN.schedule.result.days).toHaveLength(3);
    expect(DEMO_RUN.schedule.citations?.length ?? 0).toBeGreaterThan(0);
    expect(DEMO_RUN.venue.citations?.length ?? 0).toBeGreaterThan(0);
    // Budget is not a grounded agent — no citations expected.
    expect(DEMO_RUN.budget.citations).toBeUndefined();
  });

  it('keeps budget line items consistent with the stated total (initial & healed)', () => {
    const initial = DEMO_RUN.budget.result;
    expect(sumLineItems(initial.lineItems)).toBe(initial.totalBudget);

    const healed = DEMO_RUN.heal.healedResult;
    expect(sumLineItems(healed.lineItems)).toBe(healed.totalBudget);
    expect(healed.totalBudget).toBe(initial.totalBudget);
  });

  it('plans every specialist with a non-empty, needed brief (dispatchable)', () => {
    for (const id of SPECIALIST_IDS) {
      const brief = DEMO_RUN.planner.agents.find((a) => a.id === id);
      expect(brief, `missing planner brief for ${id}`).toBeDefined();
      expect(brief!.needed).toBe(true);
      expect(brief!.brief.trim().length).toBeGreaterThan(0);
    }
  });

  it('scripts a coherent self-heal story: low budget confidence → fixed', () => {
    const initialBudget = DEMO_RUN.auditor.initial.confidence?.find(
      (c) => c.targetId === 'budget',
    );
    expect(initialBudget?.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);

    // Exactly one actionable issue, targeting the widget the heal repairs.
    expect(DEMO_RUN.auditor.initial.issues).toHaveLength(1);
    expect(DEMO_RUN.auditor.initial.issues[0].targetId).toBe(DEMO_RUN.heal.targetId);
    expect(DEMO_RUN.heal.targetId).toBe('budget');

    // After healing: no issues and budget confidence back in the "high" tier.
    expect(DEMO_RUN.auditor.healed.issues).toHaveLength(0);
    const healedBudget = DEMO_RUN.auditor.healed.confidence?.find(
      (c) => c.targetId === 'budget',
    );
    expect(healedBudget?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('rebalances A/V down and contingency up while holding the total', () => {
    const before = DEMO_RUN.budget.result.lineItems;
    const after = DEMO_RUN.heal.healedResult.lineItems;
    const av = (items: typeof before) =>
      items.find((li) => li.category.startsWith('A/V'))!.amount;
    const contingency = (items: typeof before) =>
      items.find((li) => li.category === 'Contingency')!.amount;

    expect(av(after)).toBeLessThan(av(before));
    expect(contingency(after)).toBeGreaterThan(contingency(before));
  });
});

describe('BudgetWidget renders from canned data', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [BudgetWidget] }).compileComponents();
  });

  it('renders every canned line item', async () => {
    const payload = intoComponentConfig('budget', DEMO_RUN.budget.result);
    const fixture = TestBed.createComponent(BudgetWidget);
    fixture.componentRef.setInput('widgetId', 'budget');
    fixture.componentRef.setInput('title', payload.title);
    if (payload.type === 'render_budget') {
      fixture.componentRef.setInput('config', payload.config);
    }
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.line')).toHaveLength(
      DEMO_RUN.budget.result.lineItems.length,
    );
    expect(el.textContent).toContain('Venue & facilities');
    expect(el.textContent).toContain('Contingency');
  });
});
