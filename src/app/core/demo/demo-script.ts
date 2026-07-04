import type { AgentStore } from '../state/agent.store';
import { SPECIALIST_META, type SpecialistId } from '../types/agent.types';
import {
  DynamicComponentConfig,
  intoComponentConfig,
} from '../types/widget.types';
import type { DemoRunData, DemoSpecialistScript } from './demo-script.data';
import type { DemoScheduler } from './demo-timeline';

/**
 * Choreographs a scripted Maestro run by driving `AgentStore` the same way the
 * real `AgentOrchestrator` would. It never touches the network — it just sequences
 * store mutations on the demo timeline, so the existing workspace UI renders an
 * identical run.
 *
 * The full story: planner → three staggered specialists → an auditor pass that
 * flags the budget (low confidence) → an auto **self-heal** that re-renders the
 * budget (generation bump → shell pulse) and toasts a before→after confidence →
 * a clean re-audit. Mirrors the real `maybeSelfHeal`/`announceHeals` UX.
 *
 * Every delay goes through `timeline.wait`, which rejects with `DemoAbortedError`
 * on cancel; callers (DemoModeService) swallow that to stop cleanly.
 */
export interface DemoNotifier {
  info(message: string): void;
}

export interface DemoRunDeps {
  store: AgentStore;
  data: DemoRunData;
  timeline: DemoScheduler;
  model: string;
  notify: DemoNotifier;
}

export async function playDemoRun(deps: DemoRunDeps): Promise<void> {
  const { store, data, timeline, model } = deps;
  const t = data.timings;

  store.setLastUserIntent(data.intent);

  // --- Planner ---------------------------------------------------------------
  store.setAgentStatus('planner', 'thinking');
  await timeline.wait(t.plannerThinkMs);
  store.setAgentStatus('planner', 'streaming');
  await timeline.wait(t.plannerStreamMs);
  store.setPlannerRationale(data.planner.rationale);
  store.recordAgentUsage('planner', data.planner.usage, model);
  store.setAgentStatus('planner', 'done');

  // --- Dispatch briefs -------------------------------------------------------
  for (const agent of data.planner.agents) {
    store.setAgentBrief(agent.id, agent.brief);
    store.setAgentStatus(agent.id, 'pending');
  }

  // --- Specialists (staggered "parallel") ------------------------------------
  await Promise.all([
    runSpecialist(deps, 'budget', 0),
    runSpecialist(deps, 'schedule', 1),
    runSpecialist(deps, 'venue', 2),
  ]);

  // --- Auditor: initial pass flags the budget --------------------------------
  await runAudit(deps, data.auditor.initial, data.auditor.usage);

  // --- Self-heal: auto-repair the flagged widget, then re-audit clean --------
  await selfHeal(deps);

  store.touchRunWallEnded();
}

async function runSpecialist(
  deps: DemoRunDeps,
  id: SpecialistId,
  order: number,
): Promise<void> {
  const { store, data, timeline, model } = deps;
  const t = data.timings;
  const { script, payload } = specialistScript(id, data);

  await timeline.wait(order * t.specialistStaggerMs);
  store.setAgentStatus(id, 'thinking');
  await timeline.wait(t.specialistThinkMs);
  store.setAgentStatus(id, 'streaming');
  await timeline.wait(t.specialistStreamMs);
  store.upsertWidget({ id, payload, citations: script.citations });
  store.recordAgentUsage(id, script.usage, model);
  store.setAgentStatus(id, 'done');
}

async function runAudit(
  deps: DemoRunDeps,
  result: DemoRunData['auditor']['initial'],
  usage: DemoRunData['auditor']['usage'],
): Promise<void> {
  const { store, data, timeline, model } = deps;
  const t = data.timings;

  store.setAgentStatus('auditor', 'thinking');
  await timeline.wait(t.auditThinkMs);
  store.setAgentStatus('auditor', 'streaming');
  await timeline.wait(t.auditStreamMs);
  store.setAuditResult(result.summary, result.issues);
  store.setWidgetConfidence(result.confidence ?? []);
  store.recordAgentUsage('auditor', usage, model);
  store.setAgentStatus('auditor', 'done');
}

async function selfHeal(deps: DemoRunDeps): Promise<void> {
  const { store, data, timeline, model, notify } = deps;
  const t = data.timings;
  const healId = data.heal.targetId; // 'budget' in the canned run

  // Let the flagged, low-confidence widget sit briefly so the badge registers,
  // then auto-repair it.
  await timeline.wait(t.healDelayMs);
  store.setAgentStatus(healId, 'thinking');
  await timeline.wait(t.specialistThinkMs);
  store.setAgentStatus(healId, 'streaming');
  await timeline.wait(t.healStreamMs);
  // Re-render the repaired widget — the generation bump triggers the shell pulse.
  store.upsertWidget({
    id: healId,
    payload: intoComponentConfig('budget', data.heal.healedResult),
  });
  store.recordAgentUsage(healId, data.heal.usage, model);
  store.setAgentStatus(healId, 'done');

  // Re-audit → clean summary + restored confidence.
  await runAudit(deps, data.auditor.healed, data.auditor.reAuditUsage);

  // Make the (normally paid) auto-repair visible, matching the real toast copy.
  notify.info(healMessage(data, healId));
}

/** Mirrors `AgentOrchestrator.announceHeals`: "Auto-repaired Budget 55% → 90%". */
function healMessage(data: DemoRunData, healId: SpecialistId): string {
  const pct = (n: number | undefined) => `${Math.round((n ?? 0) * 100)}%`;
  const before = data.auditor.initial.confidence?.find((c) => c.targetId === healId)?.confidence;
  const after = data.auditor.healed.confidence?.find((c) => c.targetId === healId)?.confidence;
  return `Auto-repaired ${SPECIALIST_META[healId].label} ${pct(before)} → ${pct(after)}`;
}

/** Type-safe bridge from a specialist id to its canned script + render payload. */
function specialistScript(
  id: SpecialistId,
  data: DemoRunData,
): { script: DemoSpecialistScript<unknown>; payload: DynamicComponentConfig } {
  switch (id) {
    case 'budget':
      return {
        script: data.budget,
        payload: intoComponentConfig('budget', data.budget.result),
      };
    case 'schedule':
      return {
        script: data.schedule,
        payload: intoComponentConfig('schedule', data.schedule.result),
      };
    case 'venue':
      return {
        script: data.venue,
        payload: intoComponentConfig('venue', data.venue.result),
      };
  }
}
