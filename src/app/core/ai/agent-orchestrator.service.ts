import { inject, Injectable } from '@angular/core';
import { ApiKeyService } from '../auth/api-key.service';
import { AgentStore } from '../state/agent.store';
import {
  AgentBrief,
  MissingApiKeyError,
  PlannerOutput,
  SpecialistId,
  SPECIALIST_IDS,
} from '../types/agent.types';
import {
  intoComponentConfig,
  SpecialistResultMap,
} from '../types/widget.types';
import { PlannerAgent } from './agents/planner.agent';
import { BudgetAgent } from './agents/budget.agent';
import { ScheduleAgent } from './agents/schedule.agent';
import { VenueAgent } from './agents/venue.agent';

@Injectable({ providedIn: 'root' })
export class AgentOrchestrator {
  private readonly store = inject(AgentStore);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly planner = inject(PlannerAgent);
  private readonly budget = inject(BudgetAgent);
  private readonly schedule = inject(ScheduleAgent);
  private readonly venue = inject(VenueAgent);

  /**
   * Run the full planner → specialists pipeline. Resets state, calls the
   * planner, then dispatches the needed specialists in parallel. A single
   * agent's failure never blocks the others; the store reflects the final
   * state of each.
   */
  async run(userIntent: string): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    if (!userIntent.trim()) return;

    this.store.resetForRun();

    let plan: PlannerOutput;
    try {
      plan = await this.planner.plan(userIntent);
      this.store.setPlannerRationale(plan.rationale);
    } catch {
      // Planner failure is not fatal — dispatch every specialist with the
      // raw user intent so the dashboard still renders something useful.
      plan = this.fallbackPlan(userIntent);
      this.store.setPlannerRationale(
        'Planner unavailable — running all specialists on the raw brief.',
      );
    }

    for (const a of plan.agents) {
      if (a.needed) this.store.setAgentStatus(a.id, 'pending');
    }

    const tasks = plan.agents
      .filter((a) => a.needed && a.brief.trim().length > 0)
      .map((a) => this.dispatch(a.id, a.brief));

    await Promise.allSettled(tasks);
  }

  /**
   * Refine a single rendered widget by re-running ONLY its owning agent with
   * the prior payload as context; other widgets and agents are untouched.
   */
  async refine(widgetId: SpecialistId, deltaPrompt: string): Promise<void> {
    if (!this.apiKeys.hasKey()) throw new MissingApiKeyError();
    if (!deltaPrompt.trim()) return;

    const existing = this.store.getWidget(widgetId);
    if (!existing) return;

    await this.dispatch(widgetId, deltaPrompt, existing.payload.config);
  }

  private async dispatch(
    id: SpecialistId,
    brief: string,
    prior?: unknown,
  ): Promise<void> {
    try {
      const agent = this.specialistFor(id);
      const { value, citations } = await agent.run(brief, prior);
      const payload = intoComponentConfig(
        id,
        value as SpecialistResultMap[typeof id],
      );
      this.store.upsertWidget({ id, payload, citations });
    } catch {
      // Agent already flipped its status to 'error'; preserve any widgets
      // that did succeed and let the others fail in isolation.
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
