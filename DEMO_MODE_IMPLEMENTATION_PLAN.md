# Maestro — Keyless Demo Mode ("Watch a sample run") — Implementation Plan

**Date:** 2026-07-04
**Status:** **Decisions locked (§9). Phases 0–5 complete (2026-07-04) — core feature shipped.** Phase 6 (optional inline hero preview) deferred.
**Owner:** _TBD_
**Related docs:** `UX_DESIGN_AUDIT.md` (§4.1 CRITICAL — differentiator gated + static hero; §9.1 decision log — *keep BYOK, add a keyless preview*), `DESIGN_SYSTEM_MIGRATION_PLAN.md` (design standards this feature must honor), `AI_FEATURE_PROPOSALS.md`.

> **Framing.** This is the audit's single highest product-impact item (§4.1). BYOK stays (§9.1 — it's the correct zero-backend architecture). The goal is to **decouple "experiencing the wow" from "owning a key"**: a first-time visitor clicks **"Watch a sample run"** and sees the *real* workspace — Control Tower streaming, widgets materializing, telemetry ticking, an audit issue getting auto-fixed — driven by **canned data, with no Gemini call, no key, and no cost.**
>
> **Key architectural insight (validated against the code):** the entire workspace UI — Command Center, Control Tower, Audit Ribbon, and all three widgets — is **overwhelmingly driven by `AgentStore` signals**. The renderer picks widgets by `slotId` (not by network state), and every visible state (ghost → streaming → real → refine pulse → confidence badge → stale/ripple → audit issue → fix) is a function of store signals. Therefore a **scripted replay that drives `AgentStore` directly reproduces a real run with zero component changes** — we do not need to touch the Gemini path at all.

---

## 1. Goals & non-goals

### Goals
1. A **keyless, no-cost "Watch a sample run"** experience that replays the real workspace UI with canned data.
2. **Maximum fidelity, minimum new UI** — reuse the existing Command Center / Control Tower / Audit Ribbon / widgets verbatim; drive them via the store.
3. **Showcase the differentiators** the audit says are hidden: live multi-agent streaming, generative widgets materializing, telemetry, confidence scoring, and **self-healing / one-click audit fix**.
4. **Convert**: reframe the key ask as earned — *"Loved it? Connect your key to run your own brief."*
5. **Zero risk to the production pipeline** — no changes to the real Gemini/agent/orchestrator network path; the demo never calls `AgentOrchestrator` or any agent.
6. **Adhere to the design system** (tokens, button roles, gradient budget, glass, tracking, touch targets) and pass `stylelint` at error severity + build budgets.
7. **Cover the edge cases** (§8): reduced motion, tab-hidden throttling, navigation-away cleanup, key present/absent, deep-linking, double-start, real-run-in-progress, interactive-control guarding.

### Non-goals (explicitly out of scope)
- **No backend, no shared/trial key, no proxy** — rejected in §9.1 (reintroduces cost/abuse/infra). The demo is 100% client-side canned data.
- **No changes to the real run pipeline** (`AgentOrchestrator`, `AgentBase.runStreamed`, agents, schemas, prompts, pricing) — the demo is a parallel, additive path.
- **No token-level streaming simulation** — the app already shows `thinking → streaming → done` from status signals; widget content lands atomically via `upsertWidget` (matches production behavior exactly).
- **Not a redesign** — reuses existing components and design tokens.
- (Optional, decision §9) An **autoplaying looping mini-preview embedded in the hero** is treated as a stretch enhancement, not the core deliverable.

### Guiding principles
- **Drive the store, not the network.** The store is the UI's single source of truth; script it.
- **Additive & reversible.** New files + small, guarded edits to 3–4 existing files. Fully removable.
- **Deterministic storytelling.** A scripted timeline lets us choreograph a compelling, repeatable narrative (unlike a real, nondeterministic run).
- **Design-system native.** Every new pixel uses tokens + existing mixins; nothing bypasses `stylelint`.

---

## 2. Current-state assessment (the seams we build on)

Verified against the source (see the three exploration passes referenced in chat).

**The store contract (what a replay must drive)** — `src/app/core/state/agent.store.ts`:
- Writable signals: `widgets`, `agentStates`, `plannerRationale`, `auditIssues`, `auditSummary`, `widgetConfidence`, `lastUserIntent`, `staleWidgets`, `agentBriefs`, `agentTelemetry`, `runWallStartedAt/EndedAt`.
- Derived (never set directly): `globalStatus`, `isBusy`, `hasContent`, `hasFailures`, `runTelemetryTotals`, `runWallDurationMs`, `hasTelemetry`.
- Mutators we'll call: `resetForRun()`, `setLastUserIntent()`, `setAgentStatus(id, status, error?)`, `setPlannerRationale()`, `setAgentBrief()`, `upsertWidget({id, payload, citations})`, `recordAgentUsage(id, usage, model)`, `setAuditResult(summary, issues)`, `setWidgetConfidence(list)`, `markStale()/unmarkStale()`, `touchRunWallEnded()`.
- `patchAgentState` sets `startedAt` on first active phase and `completedAt` on terminal — so **scripting status transitions with real delays yields realistic per-agent durations** in the Control Tower.

**Widget selection is by `slotId`, not payload type** — `src/app/features/renderer/widget-registry.ts` maps `budget|schedule|venue` → the widget components; `DynamicComponentConfig.type` is unused at render. So canned data only needs correctly-typed `config` objects (`BudgetConfig`/`ScheduleConfig`/`VenueConfig` in `src/app/core/types/widget.types.ts`). `intoComponentConfig(id, result)` converts the specialist `*Result` shapes into the `DynamicComponentConfig` envelope.

**The gates that block a keyless workspace** (must be opened for demo mode):
1. `workspace.page.html:1` — `@if (!hasKey())` swaps the whole workspace for `<dea-no-key-empty-state />`.
2. `command-center.ts` — `canSubmit()` requires `hasKey()`.
3. `AgentOrchestrator.requireKey()` + `AgentBase.lazyClient()` — throw without a key. **We avoid these entirely by not calling the orchestrator/agents.**

**Existing demo scaffolding:** only `src/app/core/demo/sample-prompts.ts` (canned *prompts*, incl. `HERO_PROMPT`). No canned *responses*, no `DemoService`. Test fixtures in `agent-orchestrator.service.spec.ts:34–60` are the minimal type reference for a first script object.

**Routing:** `/architect` lazy-loads `WorkspacePage`; `?try=` seeds `PromptDraftService` (prefill only, no auto-run).

---

## 3. Chosen architecture

### 3.1 Approach: a `DemoRunner` that scripts `AgentStore` directly (not the agent/network seam)

Two seams were considered (see the AI-seam exploration): **(A)** intercept `AgentBase.runStreamed` / swap the 5 agent services and reuse the real orchestrator, vs **(B)** a standalone runner that scripts the store on a cancelable timeline.

**We choose (B).** Rationale:

| Factor | (A) Agent/orchestrator seam | (B) Direct store scripting ✅ |
|---|---|---|
| Fidelity of visible UI | High | **Identical** (same store signals) |
| Storytelling control (stagger, self-heal beat, timing) | Low (orchestrator parallelism is fixed & nondeterministic) | **Full** |
| Risk to production Gemini path | Touches shared code / DI | **Zero** (additive) |
| Must bypass `requireKey`/`lazyClient`/`hasKey` | Yes (3 gates + fake key) | Only the **UI** `hasKey` gate (1 spot) |
| Interactive actions during demo | Would hit real agents unless also stubbed | N/A (we guard the UI) |
| Determinism / testability | Lower | **High** |

The store is the UI's single source of truth, so (B) yields a pixel-faithful replay while keeping the real pipeline untouched.

### 3.2 New building blocks

```
src/app/core/demo/
  sample-prompts.ts          (exists)
  demo-mode.service.ts       NEW — @Service(); state + lifecycle (active/phase, start/stop/replay)
  demo-timeline.ts           NEW — cancelable scheduler (sleep(signal), pause-on-hidden, reduced-motion scaling)
  demo-script.ts             NEW (lazy) — the canned data + choreography for one sample run
  demo-script.data.ts        NEW (lazy) — the large canned PlannerOutput/*Result/AuditorOutput payloads
src/app/features/demo/
  demo-banner.ts / .html / .scss   NEW — "Sample run — no key used" banner + Replay / Exit / Connect-key
```

- **`DemoModeService` (`@Service()`, root singleton):**
  - `active = signal<boolean>(false)` — read by workspace (gate bypass) + command-center (disable submit).
  - `phase = signal<'idle'|'playing'|'complete'>('idle')` — drives banner copy/controls.
  - `start()` — begins the scripted timeline (lazy-imports `demo-script`); idempotent (cancels any prior timeline first).
  - `stop()` — aborts the timeline, `store.resetForRun()`, clears seeded prompt draft, `active(false)`; idempotent + safe on destroy.
  - `replay()` — `stop()`-then-`start()`.
  - Owns an `AbortController` for the current timeline; wires `visibilitychange` (pause/resume) and reduced-motion detection.
- **`demo-timeline.ts`:** a tiny async scheduler — `sleep(ms, signal)` that rejects on abort; a `Timeline` that runs ordered beats, **pauses accumulation while `document.hidden`**, and **scales all delays** by a factor (1 normal, ~0.12 or a short fixed preset under `prefers-reduced-motion`).
- **`demo-script.ts`:** the choreography (the ordered `async` beats calling store mutators). Lazy-loaded so canned data never bloats the initial bundle.
- **`dea-demo-banner`:** a token-styled bar rendered at the top of the workspace when `demoActive()`. Announces the sample-run status (aria-live polite), and offers **Replay**, **Exit demo**, and a **"Connect your Gemini key"** conversion CTA (opens `ApiKeyDialogService`; on success → `stop()` so the user runs for real).

### 3.3 Wiring into existing files (small, guarded edits)

1. **`app.routes.ts`** — keep `/architect`; demo entry is a query param `?demo=1` (deep-linkable) **or** `DemoModeService.start()` set imperatively before navigation. (Decision §9 D1.)
2. **`workspace.page.ts` / `.html`** — read `DemoModeService.active` (and the `?demo=1` param → `start()` on load). Gate becomes `@if (!hasKey() && !demoActive())`. Render `<dea-demo-banner>` above `.layout-grid` when `demoActive()`. On destroy → `demo.stop()`.
3. **`command-center.ts`** — `canSubmit` also requires `!demoActive()`; while demo active the textarea/submit are disabled with a hint ("Exit the sample run to enter your own brief"). Prompt text is shown by seeding `PromptDraftService` from the script.
4. **Interactive guards** — while `demoActive()`, hide/disable Refine (`refine-bar`), Retry (`control-tower`, `widget-shell`), Apply-fix/Re-audit (`audit-ribbon`) so no click can reach `AgentOrchestrator` (which would throw `MissingApiKeyError`). (Decision §9 D3.)
5. **Home hero** — add the **"Watch a sample run"** CTA (`home.page.html` / `home.page.ts`) → navigate to `/architect?demo=1`. (Decision §9 D2/D5.)

### 3.4 The scripted "story" (one sample run, using `HERO_PROMPT`)

Ordered beats (each `await`s a cancelable delay; delays scaled for reduced motion):

1. **Setup** — `active(true)`, `phase('playing')`; `store.resetForRun()`; `setLastUserIntent(HERO_PROMPT)`; seed `PromptDraftService.set(HERO_PROMPT)` so the Command Center shows the brief.
2. **Planner** — `setAgentStatus('planner','thinking')` → delay → `'streaming'` → delay → `setPlannerRationale(...)` + `setAgentStatus('planner','done')` + `recordAgentUsage('planner', fakeUsage, model)`.
3. **Dispatch** — for each specialist: `setAgentBrief(id, brief)` + `setAgentStatus(id,'pending')`.
4. **Specialists (staggered "parallel")** — each: `'thinking'` → `'streaming'` (slight per-agent stagger) → `upsertWidget({id, payload, citations})` + `recordAgentUsage(...)` + `'done'`. Widgets pop in one-by-one; Venue/Schedule carry citations (they're the "grounded" agents).
5. **Auditor** — `'pending'`→`'thinking'`→`'streaming'` → `setAuditResult(summary, [one 'warning' issue on budget])` + `setWidgetConfidence([...])` (budget deliberately ~0.55 low) + `'done'`. Audit Ribbon shows the issue; a low-confidence badge appears on the budget widget.
6. **Self-heal beat (the differentiator)** — brief pause, then a scripted fix: `setAgentStatus('budget','streaming')` → `upsertWidget(budget, healedPayload)` (**generation bump → pulse animation**) → `'done'`; then re-audit: `setAuditResult(cleanSummary, [])` + raise budget confidence to ~0.9; fire a `NotificationService` toast ("Auto-fixed Budget: trimmed A/V overrun — confidence 0.55 → 0.90"). Mirrors the real `maybeSelfHeal` UX.
7. **Finish** — `touchRunWallEnded()`; `phase('complete')`. Banner switches to "That's a sample run — connect your key to run your own." with **Replay** + **Connect key**.
8. **Loop (optional, decision §9 D5)** — auto-replay after a dwell, or wait for user.

Telemetry uses a real model id (`MODEL_FOR_MODE.fast`) so `estimateCostUsd` produces plausible totals; the banner makes clear it's a simulation (no real spend).

---

## 4. Design-standards adherence (required)

Every new surface must comply with `DESIGN_SYSTEM_MIGRATION_PLAN.md` (enforced by `stylelint` at **error**):

- **Tokens only** — color (`--dea-*`), spacing (`--space-*`), radius (`--dea-radius-*`), type (`--text-*`/`--leading-*`/`--weight-*`), tracking (`--tracking-*`). No raw literals (stylelint will fail otherwise).
- **Buttons via mixins** — banner actions use `button-secondary` (Exit/Replay) and `button-ghost` (dismiss); the **"Connect key"** conversion uses `button-primary` (solid violet, in-app). The **home hero** "Watch a sample run" is the hero surface — if it needs emphasis it may share the existing single `button-hero` gradient CTA, but per the **gradient budget (§10.2)** there must remain **≤1 gradient element per view**, so if the hero already has a gradient CTA, "Watch a sample run" is `button-secondary`.
- **Gradient budget** — the demo banner is a **tinted/glass surface**, not a new gradient. No new brand-gradient elements.
- **Glass consistency** — banner uses the `glass-surface` mixin if elevated, matching other chrome.
- **Touch targets** — new controls ≥ `--target-min` (40px), primary ≥ `--target-min-primary` (44px).
- **Focus-visible** — inherited from the global `:focus-visible` token; verify the new controls show it.
- **Motion** — respect `prefers-reduced-motion` (the timeline compresses; no essential info conveyed by motion alone).
- **No `::ng-deep`**, no half-px, no off-scale values.
- **Bundle discipline** — `demo-script*.ts` (canned data) is **lazy-imported** by `DemoModeService.start()` so it never lands in the initial bundle; watch the component-style budget on the banner.

---

## 5. Phased roadmap

| Phase | Objective | Breaking? | Effort | Output |
|---|---|---|---|---|
| **0** ✅ | Decisions lock (§9) + scaffolding: `DemoModeService` (state + start/stop stubs), `?demo=1` wiring, workspace gate bypass, empty `dea-demo-banner`. Prove you can enter/exit demo mode keyless. | No | S | **DONE (2026-07-04)** — Enter `/architect?demo=1` with no key → workspace chrome + banner; Exit/Replay/Connect wired; cleanup on route leave. |
| **1** ✅ | Canned data + types: author `demo-script.data.ts` (typed `PlannerOutput`/`BudgetResult`/`ScheduleResult`/`VenueResult`/`AuditorOutput` + citations), lazy-loaded. Unit-verify `intoComponentConfig` accepts them and widgets render. | No | M | **DONE (2026-07-04)** — `DEMO_RUN` fixture + `DemoRunData`/`DemoTimings` types; 8 specs incl. a real `BudgetWidget` render from canned data. |
| **2** ✅ | Timeline engine + happy-path replay: `demo-timeline.ts` (cancelable `sleep`, pause-on-hidden, reduced-motion scaling); drive planner→specialists→widgets→auditor→done with telemetry. | No | M | **DONE (2026-07-04)** — `sleep`/`DemoTimeline` + `playDemoRun` choreography wired into `start()`; lazy chunks confirmed; 10 new specs. |
| **3** ✅ | The "wow" beats: staggered streaming, confidence badges, scripted audit issue + **auto-fix/self-heal** (pulse + toast), Replay/loop, `phase('complete')` banner state. | No | M | **DONE (2026-07-04)** — auditor flags budget (0.55) → auto-repair re-renders (gen-bump pulse) + before→after toast → clean re-audit (0.90); banner shifts to a "done" state on complete. |
| **4** ✅ | Home hero integration: "Watch a sample run" CTA → `/architect?demo=1`; conversion CTA in banner (Connect key → exit demo → real run). Optional: animate the existing static diagram. | No | S–M | **DONE (2026-07-04)** — keyless hero + bottom CTA lead with "Watch a sample run"; banner Connect keeps the brief for a one-click real run; exit/convert strip `?demo=1` so refresh won't relaunch. |
| **5** ✅ | Edge-case hardening + guards + polish: disable interactive actions in demo; nav-away/destroy cleanup; tab-hidden; double-start; real-run-in-progress; deep-link; both themes/breakpoints; reduced motion; `stylelint`+build+tests green. | No | M | **DONE (2026-07-04)** — all run-mutating controls locked during demo (Command Center, Refine, Audit fix/re-audit, Retry); `start()` refuses over a live run (E1) + single-flight (E6); §8 cases covered. |
| **6** *(optional)* | Autoplaying looping mini-preview embedded in the hero (scaled real widgets), if desired after seeing Phases 3–4. | Med (visual) | M–L | Inline animated hero. |

Recommended: **0 → 1 → 2 → 3 → 4 → 5**. Phase 6 only if the hero CTA route proves insufficient.

### Phase 0 — completion notes (2026-07-04)
- **New:** `src/app/core/demo/demo-mode.service.ts` — `DemoModeService` (`@Service()`) exposing readonly `active`/`phase` signals and `start()` / `stop()` / `replay()`. `start()` clears the store (`resetForRun`) and flips the mode on; `stop()` is idempotent, clears the seeded prompt draft, and resets the store; `replay()` = stop→start. Timeline is intentionally not attached yet (Phases 2–3).
- **New:** `src/app/features/demo/demo-banner.{ts,html,scss}` — `dea-demo-banner`, a token-styled glass bar ("Sample run · no key needed — nothing sent to Gemini, no cost") with **Replay** (`button-ghost`), **Exit demo** (`button-secondary`), and **Connect your key** (`button-primary`, opens `ApiKeyDialogService`; only exits the demo if a key is actually connected). `aria-live="polite"`; no new gradient (accent-tinted edge only, §10.2).
- **Edited:** `workspace.page.ts` / `.html` — injects `DemoModeService`; reads `?demo=1` (wins over `?try=`) → `start()`; gate is now `@if (!hasKey() && !demoActive())` so the workspace chrome shows keyless; renders `<dea-demo-banner>` when `demoActive()`; `DestroyRef.onDestroy` → `stop()` so a demo never outlives the page.
- **Verification:** `stylelint` (error severity) clean · `ng lint` clean · `ng build` succeeds (no budget warnings; only the pre-existing `p-retry` CommonJS notice from `@google/genai`) · **142/142** unit specs pass.
- **Not yet (by design):** canned data + timeline (Phases 1–3), interactive-control guarding during demo (Phase 5), home-hero "Watch a sample run" CTA (Phase 4).

### Phase 1 — completion notes (2026-07-04)
- **New:** `src/app/core/demo/demo-script.data.ts` — lazy-loadable `DEMO_RUN: DemoRunData` (a hand-authored, faithful replay of a real run for `HERO_PROMPT`) plus `DemoRunData` / `DemoSpecialistScript<R>` / `DemoTimings` types and `DEMO_TIMINGS`. Contents: planner rationale + 3 dispatchable briefs; typed `BudgetResult` / `ScheduleResult` (3 days) / `VenueResult` with grounding `citations` on the grounded agents; auditor `initial` (1 budget warning + budget confidence 0.55) and `healed` (0 issues + budget confidence 0.90); a `heal` payload (`BUDGET_HEALED`) that trims A/V and raises contingency while holding the ₹2.5 Cr total; plausible per-agent `TokenUsage` and a real `model` id for cost display.
- **New:** `src/app/core/demo/demo-script.data.spec.ts` — 8 specs: `intoComponentConfig` accepts each `*Result` (title stripped); budget line items sum to the total (initial **and** healed); grounded agents carry citations; planner covers all `SPECIALIST_IDS` with non-empty needed briefs; the self-heal story is coherent (low→high confidence, single issue on the healed target); A/V down + contingency up with total held; and a **real `BudgetWidget` TestBed render** proves the canned config drives the actual widget (all 8 line items rendered).
- **Verification:** `ng lint` clean · `ng build` succeeds (data is tree-shaken until the timeline imports it in Phase 2; no budget warnings) · **150/150** unit specs pass (+8).
- **Design standards:** no styling in this phase; types imported from source so the fixture stays in lockstep with production shapes.

### Phase 2 — completion notes (2026-07-04)
- **New:** `src/app/core/demo/demo-timeline.ts` — a framework-free scheduler. `sleep(ms, signal, {doc?})` resolves after `ms` of **visible** time (pauses via `visibilitychange` while `document.hidden`, edge case E5), rejects with `DemoAbortedError` on abort (incl. already-aborted), and cleans up its listeners/timer. `DemoTimeline` wraps `sleep` with a speed `scale` (reduced-motion, E4) and a shared `AbortSignal`; exposes the `DemoScheduler` interface + a slim `VisibilityDoc` type for easy faking.
- **New:** `src/app/core/demo/demo-script.ts` — `playDemoRun(deps)` choreographs the happy path by driving `AgentStore` exactly like the real orchestrator would: planner (`thinking→streaming→rationale+usage→done`) → set briefs + `pending` → **three staggered specialists** (each `thinking→streaming→upsertWidget(+citations)+usage→done`, via `Promise.all`) → a clean auditor pass (`setAuditResult`/`setWidgetConfidence`/usage) → `touchRunWallEnded()`. Widget payloads built through the real `intoComponentConfig`. All delays go through `timeline.wait`, so a cancel rejects and unwinds the run.
- **Edited:** `demo-mode.service.ts` — `start()` now runs `beginRun()`: resets the store, flips mode on, **lazy-imports** `demo-script` + `demo-script.data` (kept out of the initial/workspace bundle), seeds the Command Center brief, and plays `playDemoRun` against a per-run `AbortController`. `stop()`/`replay()`/navigation abort it; `DemoAbortedError` is swallowed, any other error rethrows. Reduced-motion detected via `matchMedia` → 0.12× speed.
- **Verification:** `ng lint` clean · `stylelint` unaffected · `ng build` succeeds — **`demo-script-data` (8.35 kB) and `demo-script` (1.67 kB) emit as their own lazy chunks**, confirming the canned data loads only on demo start · **160/160** specs pass (+10: cancelable/pausing `sleep`, timeline scaling, and a full `playDemoRun` end-state incl. abort).
- **Design standards:** no new styling; behavior honors reduced-motion (E4) and background-tab (E5) up front.

### Phase 3 — completion notes (2026-07-04)
- **Edited:** `src/app/core/demo/demo-script.ts` — the choreography now plays the **self-heal beat** end-to-end, mirroring `AgentOrchestrator.maybeSelfHeal`/`announceHeals`: the auditor's **initial** pass sets one budget `warning` + budget confidence **0.55** (`runAudit(initial)`), then `selfHeal()` dwells (`healDelayMs`), re-runs the budget specialist (`thinking→streaming`), `upsertWidget`s `BUDGET_HEALED` — the **generation bump drives the existing `WidgetShell` pulse** (`shell-pulse`, 700ms) — records heal usage, and finally a clean **re-audit** (`runAudit(healed)` → 0 issues, budget **0.90**) fires a `notify.info('Auto-repaired Budget 55% → 90%')` toast, computed from the confidence deltas so the copy stays in lockstep with the data. Extracted a shared `runAudit()` helper and a `DemoNotifier` interface; the auditor pass is type-safe against `data.heal.healedResult: BudgetResult`.
- **Edited:** `src/app/core/demo/demo-mode.service.ts` — injects `NotificationService` and passes it to `playDemoRun` as `notify`; already flips `phase('complete')` when the run resolves un-aborted.
- **Edited:** `src/app/features/demo/demo-banner.{html,scss}` — Replay/complete polish: on `phase('complete')` the badge icon switches `play_circle → task_alt`, the sub-copy becomes conversion-forward ("Replay it, or connect your key to plan yours for real."), and an `.is-complete` class shifts the chrome from accent to `--dea-success` tint via a tokenized `border-color` transition. No new gradient (§10.2 budget intact); `aria-live` still announces the state change.
- **Verification:** `ng lint` clean · `stylelint` (error severity) clean · `ng build` succeeds — `demo-script` / `demo-script-data` stay lazy (out of the initial bundle) · **160/160** specs pass. Updated `demo-script.spec.ts`: the ex-"ends clean" case became **"self-heals the flagged budget"** — asserts the budget widget reaches `generation === 2` (pulse), ends clean at ≥0.80 confidence, and toasts exactly `Auto-repaired Budget 55% → 90%` once.
- **Known intermediate (resolved in Phase 5):** between the initial audit and the auto-heal (~`healDelayMs`), the Audit Ribbon's "Apply fix" and other run-mutating controls are still live; Phase 5 disables interactive actions during demo mode. The heal clears the issue automatically within ~1–2s regardless.

### Phase 4 — completion notes (2026-07-04)
- **Edited:** `src/app/pages/home/home.page.html` — the keyless path now leads with the wow (audit §4.1 decoupling): the **hero** primary CTA for visitors without a key is **"Watch a sample run"** (`play_circle` → `/architect?demo=1`, gradient `.cta-primary`) with **"Connect a Gemini key"** demoted to the stroked secondary; the has-key hero (Try the demo brief / Open the workspace) is unchanged. The **bottom CTA** swaps the keyless dead-end "Open the workspace" (which only showed the no-key empty state) for **"Watch a sample run"**, keeping "Connect Gemini key" as the primary close. Gradient budget intact — still one `.cta-primary` per section (§10.2).
- **Edited:** `src/app/features/demo/demo-banner.ts` — the in-banner **conversion path** now hands the visitor straight into a real run: on a successful "Connect your key", it calls `demo.stop({ keepBrief: true })` so the sample brief stays prefilled in the Command Center (one click to run for real), and strips `?demo=1` from the URL. "Exit demo" also strips the param. Injects `Router`/`ActivatedRoute`; uses `queryParamsHandling: 'merge'` + `replaceUrl`.
- **Edited:** `src/app/core/demo/demo-mode.service.ts` — `stop()` takes an optional `{ keepBrief }`; when set it preserves the seeded Command Center draft (used only by the convert path) instead of clearing it.
- **Fix (correctness):** `src/app/pages/workspace/workspace.page.ts` — the `?demo=1` effect now reads `demo.active()` via `untracked`, so flipping `active` off (Exit / convert) while the param lingers no longer **re-triggers the effect and restarts the demo**. Combined with the banner stripping `?demo=1`, a post-convert refresh lands in the real workspace (with a key) instead of relaunching the canned demo.
- **Diagram animation:** deferred (optional in the roadmap) — the static hero diagram is left as-is; the live workspace run is the wow, reachable in one click.
- **Verification:** `ng lint` clean · `stylelint` (error severity) clean · `ng build` succeeds (demo chunks stay lazy; only the pre-existing `p-retry` notice) · **160/160** specs pass.

### Phase 5 — completion notes (2026-07-04)
- **Interactive guards (D3 / §7).** Every run-mutating control now folds `demo.active()` into its existing disable logic, so nothing reaches `AgentOrchestrator` during a keyless run (critical for a *key* user watching the demo — a stray click would otherwise fire a real, paid agent against the scripted store):
  - **Command Center** (`command-center.{ts,html}`): the Signal-Forms textarea is `disabled` when `demoActive()`, `canSubmit()` gains `!demoActive()`, and the intake row / sample chips / Clear are hidden during demo (they reappear only after Exit). The prompt-mutating handlers (`applyHero`/`applySample`/`clearPrompt`/`onFileSelected`/`startVoice`) early-return under demo too.
  - **Refine bar** (`refine-bar.ts`): `disabled` includes `demoActive()`; the trigger tooltip explains "Sample run — connect your key to refine".
  - **Audit ribbon** (`audit-ribbon.{ts,html}`): new `canReAudit = !busy && !demoActive`; **all four** re-audit/retry/run-critic buttons (some previously had *no* disabled binding — the post-heal "Re-audit" in the clean state was live at `phase('complete')`) now bind `[disabled]="!canReAudit()"`, and `canApply()` gains `!demoActive()`.
  - **Control Tower** (`control-tower.ts`): `canRetry` gains `!demo.active()` (and `retry()` early-returns), so per-agent Retry is hidden/blocked in demo.
- **Lifecycle guards (E1/E6).** `DemoModeService.beginRun()` refuses to start over a live run (`store.isBusy()` → warn + bail) so a key user deep-linking `?demo=1` mid-run can't corrupt real results; rapid start/replay stays single-flight via the existing `cancel()` (aborts the prior timeline before a new one).
- **Already covered earlier (verified):** nav-away/destroy cleanup (E3, `WorkspacePage` `DestroyRef` → `stop()`), tab-hidden pause (E5) + reduced-motion scaling/no-loop (E4/E17) in `demo-timeline`, `?demo=1` wins over `?try=` (E8), deep-link standalone (E7), no SDK/orchestrator call in the script (E18 — structural: `demo-script` never imports the orchestrator), and post-convert URL cleanup so a refresh won't relaunch (Phase 4).
- **New tests:** `demo-mode.service.spec.ts` (+4) — start/stop teardown, **E1 busy-refusal** (warn, stays idle), `stop()` idempotency, and keepBrief vs plain-exit draft handling.
- **Verification:** `ng lint` clean · `stylelint` (error severity) clean · `ng build` succeeds (demo chunks stay lazy) · **164/164** specs pass (+4).

### Post-QA fixes (2026-07-04)
- **Icon glyphs (bug).** The app loads **Material Symbols Rounded with an explicit `icon_names=` allowlist** (font tree-shaking) in `src/index.html`. The Phase 3/4 icons `play_circle` (banner "playing" badge + both home "Watch a sample run" CTAs), `task_alt` (banner "complete" badge), and `replay` (banner Replay) were **not** in the allowlist, so they fell back to clipped ligature text ("p"/"T"/"R"). Added all three to `icon_names=` (alphabetical). `link` already rendered because it was listed.
- **Exit destination (D4 revision).** `demo-banner.exit()` is now context-aware: **no key → `router.navigateByUrl('/')`** (back to Home); **key → strip `?demo=1`** and stay on the real, empty `/architect`. Avoids dropping a keyless visitor onto the sparse no-key empty state right after the demo.

---

## 6. Data model (canned script)

```ts
// demo-script.data.ts (lazy) — types imported from existing files, so TS keeps it in sync.
interface DemoRunData {
  intent: string;                                   // HERO_PROMPT
  planner: PlannerOutput;                           // rationale + 3 AgentBriefs (all needed)
  specialists: Record<SpecialistId, {
    result: BudgetResult | ScheduleResult | VenueResult;   // → intoComponentConfig
    citations?: Citation[];                          // schedule/venue (grounded)
    usage: TokenUsage;                               // fake but plausible
  }>;
  auditor: {
    initial: AuditorOutput;                          // 1 warning on 'budget' + confidence (budget low)
    healed: AuditorOutput;                           // clean summary, [] issues, budget confidence high
    usage: TokenUsage;
  };
  heal: { targetId: SpecialistId; healedResult: BudgetResult }; // the auto-fixed budget
  timings: { thinkMs; streamMs; staggerMs; auditMs; healMs; ... };
}
```

The demo timeline consumes `DemoRunData` and calls the store mutators from §3.4. Authoring the data is a one-time content task; the spec fixtures in `agent-orchestrator.service.spec.ts` are the type reference.

---

## 7. Interactivity model during the demo

While `demoActive()`:
- **Command Center:** textarea + submit **disabled** with a hint; the brief is shown (seeded draft) but read-only-feeling.
- **Refine / Retry / Apply-fix / Re-audit / Ripple:** **hidden or disabled** so no click reaches `AgentOrchestrator`. (Defensive: the orchestrator would throw `MissingApiKeyError` anyway, but we prevent it in the UI.)
- **Header key chip / theme toggle:** remain functional. If the user connects a key mid-demo, the demo keeps playing; the banner's "Connect key" CTA is the sanctioned conversion path (it `stop()`s the demo and returns a clean, real workspace).
- **Exit demo:** `stop()` → `resetForRun()` → if no key, workspace shows `no-key-empty-state` (or navigate home — decision §9 D4).

---

## 8. Edge cases & handling

| # | Edge case | Handling |
|---|---|---|
| E1 | **Real run in progress** when demo starts (key user) | `start()` checks `store.isBusy()`; if busy, confirm/abort first (or block with a toast). Demo assumes ownership of the store; on `stop()` it `resetForRun()`. |
| E2 | **Key already present** | Demo still runs scripted (never calls Gemini). On exit, `resetForRun()` leaves a clean real workspace. |
| E3 | **User navigates away / back mid-demo** | `WorkspacePage` `DestroyRef`/`ngOnDestroy` → `demo.stop()`; timeline `AbortController.abort()` cancels pending `sleep`s; no dangling timers. |
| E4 | **`prefers-reduced-motion`** | Timeline scales delays to a short preset (or jumps near-final with gentle fades); no meaning conveyed by motion alone; toast still fires. |
| E5 | **Tab hidden / backgrounded** (setTimeout throttling; `liveTick` pauses) | Timeline pauses on `visibilitychange` (hidden) and resumes on visible, so beats don't fire in a clump; terminal `completedAt` set via status transitions keeps durations sane. |
| E6 | **Double-start / rapid Replay** | `start()`/`replay()` are single-flight: abort current timeline before starting a new one. |
| E7 | **Deep-link `/architect?demo=1`** directly (no home) | Workspace reads the param on load → `start()`; gate bypass applies; works standalone. |
| E8 | **Deep-link with `?try=` + `?demo=1`** | `?demo=1` wins; ignore `?try=` while demo active (don't seed a conflicting draft). |
| E9 | **Exit with no key** | `no-key-empty-state` shows again (or navigate to home per D4); store clean. |
| E10 | **Connect key from banner mid-demo** | Open dialog; on success `stop()` (clean store) so the user immediately has a real, empty workspace to run their brief. |
| E11 | **Demo completes then user clicks Refine/Retry** | Those controls are disabled/hidden during demo (§7); after Exit they're live again (but store is reset). |
| E12 | **Telemetry/cost confusion** | Banner explicitly states "sample run — no API key used, no cost." Telemetry is plausible but labeled. |
| E13 | **Live duration drift** (Control Tower uses `Date.now()`) | Scripted status transitions set real `startedAt/completedAt`; terminal rows show fixed durations; only the brief in-flight window uses live tick (same as production). |
| E14 | **Multiple tabs** | Each tab has its own singleton store/service instance; no cross-tab coupling (localStorage only holds key/model/settings, not run state). |
| E15 | **Component-style / bundle budget** | Banner SCSS kept lean; canned data lazy-loaded; verify `anyComponentStyle` + initial-bundle budgets after Phase 4. |
| E16 | **A11y not regressed** (a11y broadly deferred, but don't add new violations) | Banner is an `aria-live="polite"` region; controls are real `<button>`s with labels and inherit the focus-visible ring; demo is pausable (Exit) which satisfies "moving content can be stopped." |
| E17 | **Reduced-motion + loop** | If looping is enabled, disable auto-loop under reduced motion (play once). |
| E18 | **SDK/network never touched** | Assert in tests that no agent/orchestrator method is called during a demo run. |

---

## 9. Decisions — LOCKED (2026-07-04)

| # | Decision | ✅ Locked choice | Notes |
|---|---|---|---|
| **D1** | Demo entry mechanism | **`?demo=1` query param on `/architect`** | Deep-linkable, reuses the workspace, minimal routing change. |
| **D2** | Hero trigger placement | **Secondary CTA next to the existing hero button** | Keeps the gradient budget: hero keeps its one gradient CTA; "Watch a sample run" is `button-secondary`. |
| **D3** | Interactivity during demo | **Disable/hide all run-mutating controls** | Refine/Retry/Apply-fix/Re-audit/Submit disabled; the banner's Connect-key CTA is the single conversion path. |
| **D4** | Exit destination | **Context-aware** (revised 2026-07-04): **no key → Home (`/`); key → stay on `/architect`** (real empty workspace) | The bare no-key empty state felt like a dead-end straight after the demo; Home is the richer surface the visitor came from and still carries the connect-key + "Watch a sample run" CTAs. |
| **D5** | Playback | **Autoplay once on arrival, Replay on completion** | Loop off by default; no loop under `prefers-reduced-motion` (play once). |
| **D6** | Scripted sample brief | **`HERO_PROMPT`** (Bengaluru conference) | Already the hero's canonical brief. |
| **D7** | Self-heal / one-click audit-fix beat | **Included** | Headline differentiator; scripted budget fix (confidence 0.55 → 0.90) + toast. |
| **D8** | Phase 6 (inline animated hero preview) | **Deferred** | First build is the core keyless demo (Phases 0–5); revisit after Phase 4. |

---

## 10. Testing & QA strategy

**Unit (Vitest, keep 142 specs green + add):**
- `DemoModeService`: `start`/`stop`/`replay` idempotency; `stop()` resets store + clears draft + `active(false)`; abort cancels pending beats; **asserts no `AgentOrchestrator`/agent method is invoked** (E18).
- `demo-timeline`: `sleep` rejects on abort; reduced-motion scaling; pause/resume on visibility.
- `demo-script.data`: type-checks compile; `intoComponentConfig` accepts each `*Result`; a rendered widget test from canned data.
- Workspace gate: `demoActive()` bypasses `!hasKey()`; command-center submit disabled in demo.

**Manual QA matrix (both themes; desktop/tablet/mobile 375px):**
- Home → "Watch a sample run" → full run plays → completes → Replay works.
- Deep-link `/architect?demo=1` (no key) plays standalone.
- Exit demo → clean state; connect-key-from-banner → clean real workspace.
- `prefers-reduced-motion` → compressed, no jank, toast still shows.
- Tab-hide mid-run then return → no clumped beats, sane durations.
- Nav away mid-run → no console errors, timers cleared.
- Key present: demo still keyless; no Gemini network call (verify DevTools Network).
- `stylelint` at error = 0; `npm run build` within budgets; `npm test` green.

---

## 11. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scripted timing feels "off" vs a real run | Med | Med | Tune `timings`; stagger specialists; mirror real self-heal ordering. |
| Store scripting drifts from real store contract over time | Low | Med | Reuse store mutators (not private state); types imported from source; a rendered-from-canned-data test guards shape. |
| Bundle bloat from canned data | Low | Low | Lazy-import `demo-script*`; measure after Phase 4. |
| Interactive control leaks a real Gemini call | Low | Med | Disable controls in demo (§7) + E18 test; orchestrator `requireKey` is a backstop. |
| Motion-heavy demo hurts perf/battery | Low | Low | Reduced-motion path; CSS-driven (existing) animations; no new heavy effects. |
| Design drift in new banner | Low | Low | Tokens + mixins + `stylelint` error gate (§4). |

---

## 12. Success metrics

- A keyless visitor can watch a full, faithful sample run (planner → 3 streaming specialists → widgets → audit issue → auto-fix) from the landing page in **one click**, with **no network call and no key**.
- **0** new `stylelint` violations; build within budgets; **no** change to the production run pipeline.
- All §8 edge cases handled; new unit specs green + 142 existing specs unaffected.
- Clear conversion path (Connect key → real run) from the demo.

---

## 13. Rollback

Fully additive. To remove: delete `src/app/core/demo/demo-mode.service.ts`, `demo-timeline.ts`, `demo-script*.ts`, `src/app/features/demo/*`; revert the guarded edits in `workspace.page.*`, `command-center.ts`, the interactive-control guards, and the home hero CTA. No production-path code was touched.
