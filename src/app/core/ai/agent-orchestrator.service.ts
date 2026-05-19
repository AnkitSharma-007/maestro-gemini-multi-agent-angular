import { inject, Injectable } from '@angular/core';
import { ApiKeyService } from '../auth/api-key.service';
import { AgentStore } from '../state/agent.store';
import {
  AgentBrief,
  AgentId,
  AuditIssue,
  MissingApiKeyError,
  PlannerOutput,
  SpecialistId,
  SPECIALIST_IDS,
} from '../types/agent.types';
import {
  intoComponentConfig,
  SpecialistResultMap,
} from '../types/widget.types';
import {
  buildMultiRipplePrompt,
  buildRipplePrompt,
  directDependentsOf,
  upstreamsOf,
} from './ripple';
import { PlannerAgent } from './agents/planner.agent';
import { BudgetAgent } from './agents/budget.agent';
import { ScheduleAgent } from './agents/schedule.agent';
import { VenueAgent } from './agents/venue.agent';
import { AuditorAgent } from './agents/auditor.agent';

@Injectable({ providedIn: 'root' })
export class AgentOrchestrator {
  private readonly store = inject(AgentStore);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly planner = inject(PlannerAgent);
  private readonly budget = inject(BudgetAgent);
  private readonly schedule = inject(ScheduleAgent);
  private readonly venue = inject(VenueAgent);
  private readonly auditor = inject(AuditorAgent);

  private auditInFlight = false;
  private pendingAudit = false;

  /**
   * Run the full planner → specialists → auditor pipeline. Resets state,
   * calls the planner, dispatches specialists in parallel, then the auditor
   * cross-checks the rendered widgets.
   */
  async run(userIntent: string): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    const trimmed = userIntent.trim();
    if (!trimmed) return;

    this.store.resetForRun();
    this.store.setLastUserIntent(trimmed);

    let plan: PlannerOutput;
    try {
      plan = await this.planner.plan(trimmed);
      this.store.setPlannerRationale(plan.rationale);
    } catch {
      plan = this.fallbackPlan(trimmed);
      this.store.setPlannerRationale(
        'Planner unavailable — running all specialists on the raw brief.',
      );
    }

    for (const a of plan.agents) {
      if (a.needed) {
        this.store.setAgentStatus(a.id, 'pending');
        this.store.setAgentBrief(a.id, a.brief);
      }
    }

    const tasks = plan.agents
      .filter((a) => a.needed && a.brief.trim().length > 0)
      .map((a) => this.dispatch(a.id, a.brief));

    await Promise.allSettled(tasks);
    await this.audit();
    this.store.touchRunWallEnded();
  }

  /**
   * Refine a single rendered widget. On success, marks downstream widgets
   * stale (suggest-with-Update); does not auto-ripple or re-audit.
   */
  async refine(widgetId: SpecialistId, deltaPrompt: string): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    if (!deltaPrompt.trim()) return;

    const existing = this.store.getWidget(widgetId);
    if (!existing) return;

    this.store.clearAuditIssuesForTarget(widgetId);
    const ok = await this.dispatch(widgetId, deltaPrompt, existing.payload.config);
    if (ok) {
      for (const d of directDependentsOf(widgetId)) {
        if (this.store.getWidget(d)) this.store.markStale(d);
      }
    }
    this.store.touchRunWallEnded();
  }

  /** Apply a critic fix-it: refine target, auto-ripple downstreams, then audit. */
  async applyFixIt(issue: AuditIssue): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();

    const existing = this.store.getWidget(issue.targetId);
    if (!existing) return;

    const ok = await this.dispatch(
      issue.targetId,
      issue.autoBrief,
      existing.payload.config,
    );
    if (ok) {
      const downs = directDependentsOf(issue.targetId).filter((d) =>
        this.store.getWidget(d),
      );
      if (downs.length) {
        await Promise.allSettled(
          downs.map((d) => this.rippleDispatch(issue.targetId, d)),
        );
      }
    }
    await this.audit();
    this.store.touchRunWallEnded();
  }

  /** User-triggered refresh of a stale downstream widget (manual ripple). */
  async rippleUpdate(downstreamId: SpecialistId): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();

    const downstream = this.store.getWidget(downstreamId);
    if (!downstream) return;

    const ups = upstreamsOf(downstreamId)
      .filter((u) => this.store.getWidget(u))
      .map((u) => ({
        id: u,
        payload: this.store.getWidget(u)!.payload,
      }));

    if (!ups.length) {
      this.store.unmarkStale(downstreamId);
      return;
    }

    const brief = buildMultiRipplePrompt(downstreamId, ups);
    const ok = await this.dispatch(
      downstreamId,
      brief,
      downstream.payload.config,
    );
    if (ok) await this.audit();
    this.store.touchRunWallEnded();
  }

  /** Manually re-run the auditor against the current dashboard. */
  async reAudit(): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    await this.audit();
    this.store.touchRunWallEnded();
  }

  /** Re-dispatch a single agent using its last stored brief (error recovery). */
  async retryAgent(id: AgentId): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();

    if (id === 'auditor') {
      await this.audit();
      return;
    }

    if (id === 'planner') {
      const intent = this.store.lastUserIntent();
      if (!intent) return;
      try {
        const plan = await this.planner.plan(intent);
        this.store.setPlannerRationale(plan.rationale);
        for (const a of plan.agents) {
          if (a.needed) this.store.setAgentBrief(a.id, a.brief);
        }
      } catch {
        /* planner row shows error via agent state */
      }
      this.store.touchRunWallEnded();
      return;
    }

    const brief = this.store.getAgentBrief(id);
    if (!brief) return;

    const existing = this.store.getWidget(id as SpecialistId);
    const prior = existing?.payload.config;
    await this.dispatch(id as SpecialistId, brief, prior);
    this.store.touchRunWallEnded();
  }

  /** Replay the last run timeline in Mission Control (no API calls). */
  async replayTimeline(): Promise<void> {
    const events = this.store.runTimeline();
    if (!events.length || this.store.isReplaying()) return;

    this.store.isReplaying.set(true);
    this.store.resetAgentStatesOnly();
    this.store.plannerRationale.set(null);

    let lastAt = 0;
    for (const event of events) {
      const delay = Math.max(0, event.atMs - lastAt);
      if (delay > 0) {
        await sleep(delay);
      }
      this.store.applyReplayEvent(event);
      lastAt = event.atMs;
    }

    this.store.isReplaying.set(false);
  }

  private async rippleDispatch(
    upstreamId: SpecialistId,
    downstreamId: SpecialistId,
  ): Promise<boolean> {
    const upstream = this.store.getWidget(upstreamId);
    const downstream = this.store.getWidget(downstreamId);
    if (!upstream || !downstream) return false;

    const brief = buildRipplePrompt(
      upstreamId,
      upstream.payload,
      downstreamId,
    );
    return this.dispatch(downstreamId, brief, downstream.payload.config);
  }

  private async audit(): Promise<void> {
    if (this.auditInFlight) {
      this.pendingAudit = true;
      return;
    }

    const intent = this.store.lastUserIntent();
    if (!intent) return;

    const snapshot = this.store.snapshotForAudit();
    const hasAny = Object.values(snapshot).some((v) => v !== undefined);
    if (!hasAny) return;

    this.auditInFlight = true;
    this.store.setAgentStatus('auditor', 'pending');
    try {
      const { value } = await this.auditor.run(intent, snapshot);
      this.store.setAuditResult(value.summary ?? '', value.issues ?? []);
    } catch {
      // Auditor failure is non-fatal — agent state already reflects error.
    } finally {
      this.auditInFlight = false;
      this.store.touchRunWallEnded();
      if (this.pendingAudit) {
        this.pendingAudit = false;
        await this.audit();
      }
    }
  }

  private async dispatch(
    id: SpecialistId,
    brief: string,
    prior?: unknown,
  ): Promise<boolean> {
    try {
      const agent = this.specialistFor(id);
      const { value, citations } = await agent.run(brief, prior);
      const payload = intoComponentConfig(
        id,
        value as SpecialistResultMap[typeof id],
      );
      this.store.upsertWidget({ id, payload, citations });
      this.store.unmarkStale(id);
      return true;
    } catch {
      return false;
    }
  }

  private specialistFor(id: SpecialistId) {
    switch (id) {
      case 'budget':
        return this.budget;
      case 'schedule':
        return this.schedule;
      case 'venue':
        return this.venue;
    }
  }

  private fallbackPlan(userIntent: string): PlannerOutput {
    const agents: AgentBrief[] = SPECIALIST_IDS.map((id) => ({
      id,
      brief: userIntent,
      needed: true,
    }));
    return {
      rationale: '',
      agents,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
