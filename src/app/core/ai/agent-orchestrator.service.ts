import { effect, inject, Service } from '@angular/core';
import { ApiKeyService } from '../auth/api-key.service';
import { AgentStore } from '../state/agent.store';
import {
  AgentBrief,
  AgentId,
  AuditIssue,
  isSpecialistId,
  MissingApiKeyError,
  PlannerOutput,
  SpecialistId,
  SPECIALIST_IDS,
  SPECIALIST_META,
} from '../types/agent.types';
import { intoComponentConfig } from '../types/widget.types';
import { NotificationService } from '../errors/notification.service';
import { SettingsService } from '../settings/settings.service';
import { buildRepairPrompt } from './gemini.prompts';
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

/** Widgets scoring below this (0..1) trigger an automatic repair attempt. */
const CONFIDENCE_THRESHOLD = 0.6;
/** Hard cap on automatic repairs per widget per run, to bound cost and loops. */
const MAX_SELF_HEALS_PER_WIDGET = 1;

@Service()
export class AgentOrchestrator {
  private readonly store = inject(AgentStore);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly settings = inject(SettingsService);
  private readonly notifications = inject(NotificationService);
  private readonly planner = inject(PlannerAgent);
  private readonly auditor = inject(AuditorAgent);
  private readonly specialists: SpecialistAgents = {
    budget: inject(BudgetAgent),
    schedule: inject(ScheduleAgent),
    venue: inject(VenueAgent),
  };

  private auditInFlight = false;
  private pendingAudit = false;

  private readonly selfHealAttempts = new Map<SpecialistId, number>();

  private currentController: AbortController | null = null;

  constructor() {
    effect(() => {
      if (!this.apiKeys.hasKey()) {
        this.cancelInFlight();
      }
    });
  }

  private cancelInFlight(): void {
    this.currentController?.abort();
    this.currentController = null;
  }

  private freshSignal(): AbortSignal {
    this.currentController?.abort();
    this.currentController = new AbortController();
    return this.currentController.signal;
  }

  private requireKey(): void {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
  }

  async run(userIntent: string): Promise<void> {
    this.requireKey();
    const trimmed = userIntent.trim();
    if (!trimmed) return;

    const signal = this.freshSignal();
    this.store.resetForRun();
    this.selfHealAttempts.clear();
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

    // Only agents we will actually dispatch may be marked "pending". Marking a
    // needed-but-empty-brief agent pending (without dispatching it) would leave
    // it pending forever and wedge globalStatus in "running" (permanent busy).
    const dispatchable = plan.agents.filter(
      (a) => a.needed && a.brief.trim().length > 0,
    );
    for (const a of dispatchable) {
      this.store.setAgentStatus(a.id, 'pending');
      this.store.setAgentBrief(a.id, a.brief);
    }

    const tasks = dispatchable.map((a) =>
      this.dispatch(a.id, a.brief, undefined, signal),
    );

    await Promise.allSettled(tasks);
    if (signal.aborted) return;
    await this.audit(signal);
    if (!signal.aborted) await this.maybeSelfHeal(signal);
    this.store.touchRunWallEnded();
  }

  /** Marks downstream widgets stale on success; does not auto-ripple or re-audit. */
  async refine(widgetId: SpecialistId, deltaPrompt: string): Promise<void> {
    this.requireKey();
    // Single-flight: ignore new user actions while the pipeline is busy so we
    // never abort in-flight work (which would surface as cancelled widgets).
    if (this.store.isBusy()) return;
    if (!deltaPrompt.trim()) return;

    const existing = this.store.getWidget(widgetId);
    if (!existing) return;

    const signal = this.freshSignal();
    this.store.clearAuditIssuesForTarget(widgetId);
    const ok = await this.dispatch(widgetId, deltaPrompt, existing.payload.config, signal);
    if (ok) {
      // The content just changed but we don't auto-re-audit here, so the old
      // confidence score/weaknesses no longer describe it — clear the badge
      // until the next audit (the user can hit "Re-audit").
      this.store.clearWidgetConfidence(widgetId);
      for (const d of directDependentsOf(widgetId)) {
        if (this.store.getWidget(d)) this.store.markStale(d);
      }
    }
    this.store.touchRunWallEnded();
  }

  /** Apply a critic fix-it: refine target, auto-ripple downstreams, then audit. */
  async applyFixIt(issue: AuditIssue): Promise<void> {
    this.requireKey();
    if (this.store.isBusy()) return;

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
    this.requireKey();
    if (this.store.isBusy()) return;

    const downstream = this.store.getWidget(downstreamId);
    if (!downstream) return;

    const ups = upstreamsOf(downstreamId).flatMap((u) => {
      const widget = this.store.getWidget(u);
      return widget ? [{ id: u, payload: widget.payload }] : [];
    });

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
    this.requireKey();
    if (this.store.isBusy()) return;
    const signal = this.freshSignal();
    await this.audit(signal);
    this.store.touchRunWallEnded();
  }

  /** Re-dispatch a single agent using its last stored brief (error recovery). */
  async retryAgent(id: AgentId): Promise<void> {
    this.requireKey();
    const signal = this.freshSignal();

    if (id === 'auditor') {
      await this.audit(signal);
      return;
    }

    if (id === 'planner') {
      const intent = this.store.lastUserIntent();
      if (!intent) return;

      let plan: PlannerOutput;
      try {
        plan = await this.planner.plan(intent, signal);
        this.store.setPlannerRationale(plan.rationale);
      } catch {
        if (signal.aborted) return;
        plan = this.fallbackPlan(intent);
        this.store.setPlannerRationale(
          'Planner unavailable. Using the raw brief for all specialists.',
        );
        this.store.setAgentStatus('planner', 'done');
      }

      // A re-plan is only meaningful if we also re-run the specialists on the
      // new briefs and re-audit — otherwise the plan and the rendered widgets
      // silently diverge (the new briefs would be stored but never used).
      const dispatchable = plan.agents.filter(
        (a) => a.needed && a.brief.trim().length > 0,
      );
      for (const a of dispatchable) {
        this.store.setAgentStatus(a.id, 'pending');
        this.store.setAgentBrief(a.id, a.brief);
      }
      await Promise.allSettled(
        dispatchable.map((a) => this.dispatch(a.id, a.brief, undefined, signal)),
      );
      if (!signal.aborted) await this.audit(signal);
      this.store.touchRunWallEnded();
      return;
    }

    if (!isSpecialistId(id)) return;

    const brief = this.store.getAgentBrief(id);
    if (!brief) return;

    const existing = this.store.getWidget(id);
    const prior = existing?.payload.config;
    await this.dispatch(id, brief, prior, signal);
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
      this.store.setWidgetConfidence(value.confidence ?? []);
    } catch {
      // Auditor failure is non-fatal — agent state already reflects error.
    } finally {
      this.auditInFlight = false;
      this.store.touchRunWallEnded();
      if (this.pendingAudit) {
        this.pendingAudit = false;
        // Re-run against the *current* controller. The signal that started this
        // audit may have been aborted by the very action that queued the next
        // one (e.g. a user "Re-audit"), so reusing it would silently drop the
        // queued audit.
        const nextSignal = this.currentController?.signal;
        if (!nextSignal?.aborted) await this.audit(nextSignal);
      }
    }
  }

  /**
   * After an audit, automatically re-run any widget the critic scored below
   * the confidence threshold, using its flagged weaknesses as a repair brief.
   * Capped per widget per run to bound cost and prevent loops; re-audits once
   * if anything was healed.
   */
  private async maybeSelfHeal(signal: AbortSignal): Promise<void> {
    // Opt-out: auto-heal spends extra tokens on the user's key, so respect the
    // user's setting (default on for the demo experience).
    if (!this.settings.autoHeal()) return;

    const healed: { id: SpecialistId; before: number }[] = [];

    for (const id of SPECIALIST_IDS) {
      if (signal.aborted) return;

      const confidence = this.store.getWidgetConfidence(id);
      const widget = this.store.getWidget(id);
      if (!confidence || !widget) continue;
      if (confidence.confidence >= CONFIDENCE_THRESHOLD) continue;

      const attempts = this.selfHealAttempts.get(id) ?? 0;
      if (attempts >= MAX_SELF_HEALS_PER_WIDGET) continue;
      this.selfHealAttempts.set(id, attempts + 1);

      const repairBrief = buildRepairPrompt(confidence.weaknesses);
      const ok = await this.dispatch(id, repairBrief, widget.payload.config, signal);
      if (ok) healed.push({ id, before: confidence.confidence });
    }

    if (healed.length && !signal.aborted) {
      await this.audit(signal);
      if (!signal.aborted) this.announceHeals(healed);
    }
  }

  /** Make the (paid) auto-repair visible with a before → after confidence toast. */
  private announceHeals(healed: readonly { id: SpecialistId; before: number }[]): void {
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    const parts = healed.map(({ id, before }) => {
      const after = this.store.getWidgetConfidence(id)?.confidence;
      const label = SPECIALIST_META[id].label;
      return after === undefined
        ? label
        : `${label} ${pct(before)} → ${pct(after)}`;
    });
    this.notifications.info(
      healed.length === 1
        ? `Auto-repaired ${parts[0]}`
        : `Auto-repaired ${healed.length} widgets — ${parts.join(', ')}`,
    );
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
