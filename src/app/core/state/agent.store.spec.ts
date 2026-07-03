import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { AgentStore } from './agent.store';
import type { DynamicComponentConfig } from '../types/widget.types';

const budgetPayload: DynamicComponentConfig = {
  type: 'render_budget',
  title: 'B',
  config: { totalBudget: 100, currency: 'USD', lineItems: [] },
};

const venuePayload: DynamicComponentConfig = {
  type: 'render_venue',
  title: 'V',
  config: {
    name: 'Acme',
    city: 'Bengaluru',
    capacity: 1000,
    amenities: [],
    estimatedCost: 200000,
    currency: 'INR',
    rationale: 'r',
  },
};

describe('AgentStore', () => {
  let store: AgentStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(AgentStore);
  });

  describe('initial state', () => {
    it('starts idle with no widgets and no telemetry', () => {
      expect(store.globalStatus()).toBe('idle');
      expect(store.isBusy()).toBe(false);
      expect(store.hasContent()).toBe(false);
      expect(store.hasTelemetry()).toBe(false);
    });
  });

  describe('upsertWidget', () => {
    it('inserts a widget at generation 1 on first write', () => {
      const entry = store.upsertWidget({ id: 'budget', payload: budgetPayload });
      expect(entry.generation).toBe(1);
      expect(entry.id).toBe('budget');
      expect(store.hasContent()).toBe(true);
    });

    it('increments generation on each subsequent write', () => {
      store.upsertWidget({ id: 'budget', payload: budgetPayload });
      const second = store.upsertWidget({ id: 'budget', payload: budgetPayload });
      const third = store.upsertWidget({ id: 'budget', payload: budgetPayload });
      expect(second.generation).toBe(2);
      expect(third.generation).toBe(3);
    });

    it('persists citations alongside the payload', () => {
      const entry = store.upsertWidget({
        id: 'venue',
        payload: venuePayload,
        citations: [{ title: 'Source', uri: 'https://a.example' }],
      });
      expect(entry.citations).toEqual([
        { title: 'Source', uri: 'https://a.example' },
      ]);
    });
  });

  describe('setAgentStatus / globalStatus', () => {
    it('flips to "planning" while the planner is thinking', () => {
      store.setAgentStatus('planner', 'thinking');
      expect(store.globalStatus()).toBe('planning');
      expect(store.isBusy()).toBe(true);
    });

    it('flips to "running" while any specialist is active and the planner is done', () => {
      store.setAgentStatus('planner', 'done');
      store.setAgentStatus('budget', 'streaming');
      expect(store.globalStatus()).toBe('running');
      expect(store.isBusy()).toBe(true);
    });

    it('captures startedAt on the first active transition', () => {
      const before = Date.now();
      store.setAgentStatus('budget', 'thinking');
      const state = store.agentStates().budget;
      expect(state.startedAt).toBeGreaterThanOrEqual(before);
      expect(state.completedAt).toBeUndefined();
    });

    it('captures completedAt on terminal status', () => {
      store.setAgentStatus('budget', 'thinking');
      store.setAgentStatus('budget', 'done');
      const state = store.agentStates().budget;
      expect(state.startedAt).toBeDefined();
      expect(state.completedAt).toBeDefined();
      expect(state.completedAt!).toBeGreaterThanOrEqual(state.startedAt!);
    });

    it('resets completedAt when an agent restarts from error', () => {
      store.setAgentStatus('budget', 'thinking');
      store.setAgentStatus('budget', 'error', {
        kind: 'unknown',
        title: 'Something went wrong',
        message: 'boom',
        retryable: true,
      });
      store.setAgentStatus('budget', 'thinking');
      const state = store.agentStates().budget;
      expect(state.completedAt).toBeUndefined();
    });

    it('stores the AppError on the agent state when it fails', () => {
      store.setAgentStatus('budget', 'error', {
        kind: 'quota',
        title: 'Rate limit reached',
        message: 'slow down',
        retryable: true,
      });
      expect(store.agentStates().budget.error?.kind).toBe('quota');
    });

    it('reports "done" when a specialist finished without errors', () => {
      store.setAgentStatus('planner', 'done');
      store.setAgentStatus('budget', 'done');
      expect(store.globalStatus()).toBe('done');
    });

    it('reports "error" when the planner succeeded but every specialist failed', () => {
      store.setAgentStatus('planner', 'done');
      store.setAgentStatus('budget', 'error', {
        kind: 'unknown',
        title: 't',
        message: 'm',
        retryable: true,
      });
      store.setAgentStatus('schedule', 'error', {
        kind: 'unknown',
        title: 't',
        message: 'm',
        retryable: true,
      });
      store.setAgentStatus('venue', 'error', {
        kind: 'unknown',
        title: 't',
        message: 'm',
        retryable: true,
      });
      expect(store.globalStatus()).toBe('error');
      expect(store.hasFailures()).toBe(true);
    });

    it('keeps "done" for partial success (one specialist done, one errored)', () => {
      store.setAgentStatus('planner', 'done');
      store.setAgentStatus('budget', 'done');
      store.setAgentStatus('venue', 'error', {
        kind: 'unknown',
        title: 't',
        message: 'm',
        retryable: true,
      });
      expect(store.globalStatus()).toBe('done');
      expect(store.hasFailures()).toBe(true);
    });

    it('reports "error" when the planner itself failed', () => {
      store.setAgentStatus('planner', 'error', {
        kind: 'unknown',
        title: 't',
        message: 'm',
        retryable: true,
      });
      expect(store.globalStatus()).toBe('error');
    });
  });

  describe('telemetry', () => {
    it('records usage and recomputes run totals', () => {
      const model = 'gemini-3.5-flash';
      store.recordAgentUsage(
        'budget',
        { promptTokens: 1000, outputTokens: 200, totalTokens: 1200 },
        model,
      );
      store.recordAgentUsage(
        'venue',
        { promptTokens: 2000, outputTokens: 300, totalTokens: 2300 },
        model,
      );

      const totals = store.runTelemetryTotals();
      expect(totals.totalTokens).toBe(3500);
      expect(totals.promptTokens).toBe(3000);
      expect(totals.outputTokens).toBe(500);
      expect(totals.apiCalls).toBe(2);
      expect(totals.estimatedCostUsd).toBeGreaterThan(0);
      expect(store.hasTelemetry()).toBe(true);
    });

    it('accumulates usage across multiple recordings on the same agent', () => {
      const model = 'gemini-3.5-flash';
      store.recordAgentUsage(
        'budget',
        { promptTokens: 100, outputTokens: 50, totalTokens: 150 },
        model,
      );
      store.recordAgentUsage(
        'budget',
        { promptTokens: 200, outputTokens: 100, totalTokens: 300 },
        model,
      );
      const t = store.getAgentTelemetry('budget');
      expect(t?.totalTokens).toBe(450);
      expect(t?.apiCalls).toBe(2);
    });
  });

  describe('stale tracking', () => {
    it('marks and unmarks widgets idempotently', () => {
      store.markStale('budget');
      store.markStale('budget');
      expect(store.staleWidgets()).toEqual(['budget']);

      store.unmarkStale('budget');
      expect(store.staleWidgets()).toEqual([]);
    });

    it('clearStale wipes the whole list', () => {
      store.markStale('budget');
      store.markStale('venue');
      expect(store.staleWidgets()).toHaveLength(2);
      store.clearStale();
      expect(store.staleWidgets()).toEqual([]);
    });
  });

  describe('audit issues', () => {
    it('clears only issues targeting a given widget', () => {
      store.setAuditResult('Found issues', [
        { id: 'a', targetId: 'budget', severity: 'warning', message: 'm1', autoBrief: 'b1' },
        { id: 'b', targetId: 'venue', severity: 'info', message: 'm2', autoBrief: 'b2' },
      ]);
      store.clearAuditIssuesForTarget('budget');
      expect(store.auditIssues()).toHaveLength(1);
      expect(store.auditIssues()[0].id).toBe('b');
    });

    it('dismisses a single issue by id', () => {
      store.setAuditResult('x', [
        { id: 'a', targetId: 'budget', severity: 'warning', message: 'm1', autoBrief: 'b1' },
        { id: 'b', targetId: 'venue', severity: 'info', message: 'm2', autoBrief: 'b2' },
      ]);
      store.dismissAuditIssue('a');
      expect(store.auditIssues().map((i) => i.id)).toEqual(['b']);
    });

    it('deduplicates model-generated ids so @for track never collides', () => {
      store.setAuditResult('x', [
        { id: 'dup', targetId: 'budget', severity: 'warning', message: 'm1', autoBrief: 'b1' },
        { id: 'dup', targetId: 'venue', severity: 'info', message: 'm2', autoBrief: 'b2' },
        { id: 'dup', targetId: 'schedule', severity: 'info', message: 'm3', autoBrief: 'b3' },
      ]);
      const ids = store.auditIssues().map((i) => i.id);
      expect(new Set(ids).size).toBe(3);
      expect(ids).toEqual(['dup', 'dup-2', 'dup-3']);
    });

    it('backfills a stable id for blank ids', () => {
      store.setAuditResult('x', [
        { id: '', targetId: 'budget', severity: 'warning', message: 'm1', autoBrief: 'b1' },
        { id: '   ', targetId: 'venue', severity: 'info', message: 'm2', autoBrief: 'b2' },
      ]);
      const ids = store.auditIssues().map((i) => i.id);
      expect(new Set(ids).size).toBe(2);
      expect(ids.every((id) => id.length > 0)).toBe(true);
    });
  });

  describe('widget confidence', () => {
    it('sets and reads per-widget confidence keyed by target', () => {
      store.setWidgetConfidence([
        { targetId: 'budget', confidence: 0.9, weaknesses: [] },
        { targetId: 'venue', confidence: 0.4, weaknesses: ['too small'] },
      ]);
      expect(store.getWidgetConfidence('budget')?.confidence).toBe(0.9);
      expect(store.getWidgetConfidence('venue')?.weaknesses).toEqual(['too small']);
      expect(store.getWidgetConfidence('schedule')).toBeUndefined();
    });

    it('merges later assessments over earlier ones', () => {
      store.setWidgetConfidence([{ targetId: 'budget', confidence: 0.4, weaknesses: ['w'] }]);
      store.setWidgetConfidence([{ targetId: 'budget', confidence: 0.85, weaknesses: [] }]);
      expect(store.getWidgetConfidence('budget')?.confidence).toBe(0.85);
    });

    it('is cleared by resetForRun', () => {
      store.setWidgetConfidence([{ targetId: 'budget', confidence: 0.4, weaknesses: [] }]);
      store.resetForRun();
      expect(store.getWidgetConfidence('budget')).toBeUndefined();
    });

    it('clearWidgetConfidence drops only the target widget', () => {
      store.setWidgetConfidence([
        { targetId: 'budget', confidence: 0.5, weaknesses: ['w'] },
        { targetId: 'venue', confidence: 0.9, weaknesses: [] },
      ]);
      store.clearWidgetConfidence('budget');
      expect(store.getWidgetConfidence('budget')).toBeUndefined();
      expect(store.getWidgetConfidence('venue')?.confidence).toBe(0.9);
    });
  });

  describe('snapshotForAudit', () => {
    it('returns payloads keyed by specialist id, undefined for missing slots', () => {
      store.upsertWidget({ id: 'budget', payload: budgetPayload });
      const snap = store.snapshotForAudit();
      expect(snap.budget).toEqual(budgetPayload);
      expect(snap.schedule).toBeUndefined();
      expect(snap.venue).toBeUndefined();
    });
  });

  describe('resetForRun', () => {
    it('clears widgets, audit, intent, telemetry, and stale tracking', () => {
      store.upsertWidget({ id: 'budget', payload: budgetPayload });
      store.setLastUserIntent('a brief');
      store.setAuditResult('x', [
        { id: 'a', targetId: 'budget', severity: 'warning', message: 'm', autoBrief: 'b' },
      ]);
      store.markStale('venue');
      store.recordAgentUsage(
        'budget',
        { promptTokens: 10, outputTokens: 5, totalTokens: 15 },
        'gemini-3.5-flash',
      );

      store.resetForRun();

      expect(store.hasContent()).toBe(false);
      expect(store.lastUserIntent()).toBeNull();
      expect(store.auditIssues()).toEqual([]);
      expect(store.staleWidgets()).toEqual([]);
      expect(store.runTelemetryTotals().totalTokens).toBe(0);
    });

    it('starts the wall clock so runWallDurationMs becomes measurable', async () => {
      store.resetForRun();
      await new Promise((r) => setTimeout(r, 5));
      store.touchRunWallEnded();
      const ms = store.runWallDurationMs();
      expect(ms).toBeDefined();
      expect(ms!).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runWallDurationMs', () => {
    it('is undefined before a run starts', () => {
      expect(store.runWallDurationMs()).toBeUndefined();
    });

    it('measures elapsed time once a run finishes', async () => {
      store.resetForRun();
      await new Promise((r) => setTimeout(r, 5));
      store.touchRunWallEnded();
      const ms = store.runWallDurationMs();
      expect(ms).toBeDefined();
      expect(ms!).toBeGreaterThanOrEqual(0);
    });
  });
});
