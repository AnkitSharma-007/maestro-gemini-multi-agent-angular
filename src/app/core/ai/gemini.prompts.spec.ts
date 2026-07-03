import { describe, expect, it } from 'vitest';
import {
  AuditableWidgets,
  buildAuditorContents,
  buildRefinePrompt,
  buildRepairPrompt,
} from './gemini.prompts';
import type { DynamicComponentConfig } from '../types/widget.types';

describe('buildRefinePrompt', () => {
  it('embeds the prior JSON as a fenced block', () => {
    const prompt = buildRefinePrompt({ x: 1 }, 'shrink x by 50%');
    expect(prompt).toContain('```json');
    expect(prompt).toContain('"x": 1');
    expect(prompt).toContain('shrink x by 50%');
  });

  it('asks the agent to return the full revised object as strict JSON', () => {
    const prompt = buildRefinePrompt({ y: 'z' }, 'change y to "w"');
    expect(prompt).toMatch(/full revised object/i);
    expect(prompt).toMatch(/strict JSON/i);
  });

  it('preserves the user adjustment verbatim', () => {
    const adjustment = 'Add a contingency line of 10% of total — IMPORTANT.';
    const prompt = buildRefinePrompt({}, adjustment);
    expect(prompt).toContain(adjustment);
  });
});

describe('buildRepairPrompt', () => {
  it('lists each weakness as a bullet', () => {
    const prompt = buildRepairPrompt([
      'Missing a contingency line item',
      'Total does not match the sum of line items',
    ]);
    expect(prompt).toContain('- Missing a contingency line item');
    expect(prompt).toContain('- Total does not match the sum of line items');
  });

  it('ignores blank weaknesses', () => {
    const prompt = buildRepairPrompt(['Real weakness', '   ', '']);
    expect(prompt).toContain('- Real weakness');
    expect(prompt).not.toMatch(/-\s*\n/);
  });

  it('falls back to a generic instruction when there are no weaknesses', () => {
    const prompt = buildRepairPrompt([]);
    expect(prompt).toMatch(/improve the overall quality/i);
  });

  it('tells the agent to preserve what is already correct', () => {
    const prompt = buildRepairPrompt(['x']);
    expect(prompt).toMatch(/keep everything that is already correct/i);
  });
});

const budgetPayload: DynamicComponentConfig = {
  type: 'render_budget',
  title: 'Tentative Budget',
  config: {
    totalBudget: 100000,
    currency: 'USD',
    lineItems: [
      { category: 'Venue', amount: 40000, rationale: 'Mid-tier hall.' },
    ],
  },
};

describe('buildAuditorContents', () => {
  it('includes the user brief verbatim', () => {
    const prompt = buildAuditorContents('Plan a 2-day summit', {});
    expect(prompt).toContain('## User brief');
    expect(prompt).toContain('Plan a 2-day summit');
  });

  it('renders a fenced JSON block for each provided widget', () => {
    const widgets: AuditableWidgets = { budget: budgetPayload };
    const prompt = buildAuditorContents('brief', widgets);
    expect(prompt).toContain('### budget');
    expect(prompt).toContain('```json');
    expect(prompt).toContain('"totalBudget": 100000');
  });

  it('flags missing widgets explicitly so the auditor does not invent issues for them', () => {
    const prompt = buildAuditorContents('brief', {});
    expect(prompt).toContain('### budget');
    expect(prompt).toContain('### schedule');
    expect(prompt).toContain('### venue');
    expect(prompt).toMatch(/not available/i);
  });

  it('lists widgets in stable budget → schedule → venue order', () => {
    const prompt = buildAuditorContents('brief', {});
    const budgetIdx = prompt.indexOf('### budget');
    const scheduleIdx = prompt.indexOf('### schedule');
    const venueIdx = prompt.indexOf('### venue');
    expect(budgetIdx).toBeGreaterThan(-1);
    expect(scheduleIdx).toBeGreaterThan(budgetIdx);
    expect(venueIdx).toBeGreaterThan(scheduleIdx);
  });
});
