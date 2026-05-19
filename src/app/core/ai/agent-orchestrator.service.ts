import { effect, inject, Injectable } from '@angular/core';
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
import { intoComponentConfig } from '../types/widget.types';
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

interface SpecialistAgents {
  budget: BudgetAgent;
  schedule: ScheduleAgent;
  venue: VenueAgent;
}

@Injectable({ providedIn: 'root' })
export class AgentOrchestrator {
  private readonly store = inject(AgentStore);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly planner = inject(PlannerAgent);
  private readonly auditor = inject(AuditorAgent);
  private readonly specialists: SpecialistAgents = {
    budget: inject(BudgetAgent),
    schedule: inject(ScheduleAgent),
    venue: inject(VenueAgent),
  };

  private auditInFlight = false;
  private pendingAudit = false;

  private currentController: AbortController | null = null;

  constructor() {
    effect(() => {
      if (!this.apiKeys.hasKey()) {
        this.cancelInFlight();
      }
    });
  }

  /** Aborts any in-flight Gemini streams started by this orchestrator. */
  cancelInFlight(): void {
    this.currentController?.abort();
    this.currentController = null;
  }

  private freshSignal(): AbortSignal {
    this.currentController?.abort();
    this.currentController = new AbortController();
    return this.currentController.signal;
  }

  async run(userIntent: string): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    const trimmed = userIntent.trim();
    if (!trimmed) return;

    const signal = this.freshSignal();
    this.store.resetForRun();
    this.store.setLastUserIntent(trimmed);

    let plan: PlannerOutput;
    try {
      plan = await this.planner.plan(trimmed, signal);
      this.store.setPlannerRationale(plan.rationale);
    } catch {
      if (signal.aborted) return;
      plan = this.fallbackPlan(trimmed);
      this.store.setPlannerRationale(
        'Planner unavailable. Running all specialists on the raw brief.',
      );
      this.store.setAgentStatus('planner', 'done');
    }

    for (const a of plan.agents) {
      if (a.needed) {
        this.store.setAgentStatus(a.id, 'pending');
        this.store.setAgentBrief(a.id, a.brief);
      }
    }

    const tasks = plan.agents
      .filter((a) => a.needed && a.brief.trim().length > 0)
      .map((a) => this.dispatch(a.id, a.brief, undefined, signal));

    await Promise.allSettled(tasks);
    if (signal.aborted) return;
    await this.audit(signal);
    this.store.touchRunWallEnded();
  }

  /** Marks downstream widgets stale on success; does not auto-ripple or re-audit. */
  async refine(widgetId: SpecialistId, deltaPrompt: string): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    if (!deltaPrompt.trim()) return;

    const existing = this.store.getWidget(widgetId);
    if (!existing) return;

    const signal = this.freshSignal();
    this.store.clearAuditIssuesForTarget(widgetId);
    const ok = await this.dispatch(widgetId, deltaPrompt, existing.payload.config, signal);
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

    const signal = this.freshSignal();
    const ok = await this.dispatch(
      issue.targetId,
      issue.autoBrief,
      existing.payload.config,
      signal,
    );
    if (ok && !signal.aborted) {
      const downs = directDependentsOf(issue.targetId).filter((d) =>
        this.store.getWidget(d),
      );
      if (downs.length) {
        await Promise.allSettled(
          downs.map((d) => this.rippleDispatch(issue.targetId, d, signal)),
        );
      }
    }
    if (!signal.aborted) await this.audit(signal);
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

    const signal = this.freshSignal();
    const brief = buildMultiRipplePrompt(downstreamId, ups);
    const ok = await this.dispatch(
      downstreamId,
      brief,
      downstream.payload.config,
      signal,
    );
    if (ok && !signal.aborted) await this.audit(signal);
    this.store.touchRunWallEnded();
  }

  /** Manually re-run the auditor against the current dashboard. */
  async reAudit(): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    const signal = this.freshSignal();
    await this.audit(signal);
    this.store.touchRunWallEnded();
  }

  /** Re-dispatch a single agent using its last stored brief (error recovery). */
  async retryAgent(id: AgentId): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    const signal = this.freshSignal();

    if (id === 'auditor') {
      await this.audit(signal);
      return;
    }

    if (id === 'planner') {
      const intent = this.store.lastUserIntent();
      if (!intent) return;
      try {
        const plan = await this.planner.plan(intent, signal);
        this.store.setPlannerRationale(plan.rationale);
        for (const a of plan.agents) {
          if (a.needed) this.store.setAgentBrief(a.id, a.brief);
        }
      } catch {
        if (signal.aborted) return;
        const fallback = this.fallbackPlan(intent);
        this.store.setPlannerRationale(
          'Planner unavailable. Using the raw brief for all specialists.',
        );
        for (const a of fallback.agents) {
          if (a.needed) this.store.setAgentBrief(a.id, a.brief);
        }
        this.store.setAgentStatus('planner', 'done');
      }
      this.store.touchRunWallEnded();
      return;
    }

    const brief = this.store.getAgentBrief(id);
    if (!brief) return;

    const existing = this.store.getWidget(id as SpecialistId);
    const prior = existing?.payload.config;
    await this.dispatch(id as SpecialistId, brief, prior, signal);
    this.store.touchRunWallEnded();
  }

  private async rippleDispatch(
    upstreamId: SpecialistId,
    downstreamId: SpecialistId,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const upstream = this.store.getWidget(upstreamId);
    const downstream = this.store.getWidget(downstreamId);
    if (!upstream || !downstream) return false;

    const brief = buildRipplePrompt(
      upstreamId,
      upstream.payload,
      downstreamId,
    );
    return this.dispatch(downstreamId, brief, downstream.payload.config, signal);
  }

  private async audit(signal?: AbortSignal): Promise<void> {
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
      const { value } = await this.auditor.run(intent, snapshot, signal);
      this.store.setAuditResult(value.summary ?? '', value.issues ?? []);
    } catch {
      // Auditor failure is non-fatal — agent state already reflects error.
    } finally {
      this.auditInFlight = false;
      this.store.touchRunWallEnded();
      if (this.pendingAudit && !signal?.aborted) {
        this.pendingAudit = false;
        await this.audit(signal);
      }
    }
  }

  private async dispatch(
    id: SpecialistId,
    brief: string,
    prior?: unknown,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      const { value, citations } = await this.specialists[id].run(brief, prior, signal);
      const payload = intoComponentConfig(id, value);
      this.store.upsertWidget({ id, payload, citations });
      this.store.unmarkStale(id);
      return true;
    } catch {
      return false;
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
