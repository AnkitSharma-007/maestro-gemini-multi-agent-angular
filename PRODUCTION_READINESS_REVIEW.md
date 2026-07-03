# Maestro — Production Readiness Review

**Date:** 2026-07-03
**Reviewer:** End-to-end code + user-journey audit (read-only static review; no runtime/pen-test)
**Scope:** Entire `src/` tree — orchestration, state, AI agents, error handling, UI/UX, styling, security posture, config, and process.
**App under review:** Client-only Angular 22 (zoneless, signals) SPA. Five-agent Gemini pipeline (Planner → Budget/Schedule/Venue → Auditor) over a signal `AgentStore`, coordinated by `AgentOrchestrator`. BYOK, no backend, strict-ish CSP.
**Method:** Traced each user journey (first-run onboarding, key connect, brief → dashboard, refine, ripple, fix-it, retry, self-heal, multimodal intake) across files rather than reviewing files in isolation; considered happy paths and failure/interruption/edge scenarios.

> **Remediation update — 2026-07-03:** The **P0 blockers are fixed and verified** (full suite green, production build clean). Resolved: **H1** (stuck-busy lockup), **H2** (aborts no longer shown as errors + user actions gated on global busy), **M6** (`script-src 'unsafe-inline'` removed; theme init self-hosted, critical-CSS inlining disabled).
>
> **Remediation update 2 — 2026-07-03 (P1):** The **P1 tier is now fixed and verified** (full suite green at **137 specs**, production build clean). Resolved: **M1** (refine clears the stale confidence badge), **M2** (failed refine on a rendered widget now shows an inline "Update failed" banner + Retry), **M3** (queued audit re-runs against the current controller so a concurrent re-audit isn't dropped), **M4** (mic stopped on destroy/submit + permission errors surfaced), **M5** (auto self-heal is now opt-out via a Control Tower toggle and announces a before → after confidence toast), **M7** (auditor issue ids de-duplicated in the store), **M8** (`retryAgent('planner')` now re-dispatches specialists and re-audits). Details inline below, marked ✅.
>
> **Remediation update 3 — 2026-07-03 (P2 batch):** Most **P2 process/polish** items are fixed (full suite green at **142 specs**, `npm run lint` clean, production build clean). Resolved: **L2** (angular-eslint config + `lint` script — CI intentionally out of scope per maintainer; also removed dead `RENDER_TYPE_BY_ID`), **L3** (`engines` Node pin + `.nvmrc`), **L5** (Command Center prompt cap + soft warning), **L6** (`safeCurrencyCode` normalization before `CurrencyPipe`), **L7** (`WidgetShell` `pulseTimer` cleared on destroy), **L9** (README reconciled with actual CSP/self-heal/tests). **Still open:** **M9** (plaintext key — accepted BYOK trade-off), **L1** (offline UX), **L4** (a11y landmarks/tooltip), **L8** (intake polish), **S1** (scalability note).

---

## 1. Executive summary

Maestro is a **well-architected, unusually clean demo-grade codebase** with production-shaped bones: a single source of truth (`AgentStore`), a single mutation surface (`AgentOrchestrator`), a disciplined error taxonomy (`toAppError`), consistent `AbortController` cancellation, lazy-loaded SDK/dialog/widgets, live telemetry, and a healthy test suite (137 passing specs). Rendering is XSS-safe (no `innerHTML`/`bypassSecurityTrust`; all external links use `rel="noopener noreferrer"`; Angular sanitizes bound `href`s). Accessibility basics (aria-live regions, aria-labels, focus management) are present.

As originally reviewed, it was **not yet production-ready** as a general-audience product. The dominant theme was **concurrency and interruption handling**: the app is built as a strict single-flight pipeline, but the UI exposes several actions that can run concurrently, and the shared-cancellation model turned those overlaps into spurious error states and, in one case, a permanent "stuck busy" lockup. A second theme was **silent cost/behavior**: auto self-heal spent the user's tokens without consent or visibility, and manual refine left the confidence badge stale. Security was good for a client-only BYOK app but had one avoidable weakening (`script-src 'unsafe-inline'`).

> **Post-remediation (2026-07-03):** All **P0 and P1** findings, plus most **P2** process/polish items, are now **fixed and verified** (142 specs green, `npm run lint` clean, production build clean). Concurrency/interruption is single-flighted and gated on global busy; aborts reset to idle; the queued re-audit is no longer dropped. Auto self-heal is opt-out and self-announcing; refine clears stale confidence and surfaces inline failures. `script-src` is now `'self'`. A linter (angular-eslint) and Node `engines`/`.nvmrc` pin are in place. The remaining open items are **M9** (plaintext key — an accepted BYOK trade-off), **L1** (offline UX), **L4** (a11y landmarks/tooltip), **L8** (intake polish), and the **S1** scalability note. CI was intentionally left out of scope.

**Overall health: originally 7/10 — strong foundation with a handful of real reliability bugs and consent/observability gaps. With P0+P1 closed, the remaining gate items are process/polish (P2).** None were architectural rewrites; all fixes were localized.

### Health by dimension

| Dimension | Rating | Notes |
|---|---|---|
| Architecture & code quality | Strong | Clean contracts, signals, good separation; hard-coded to exactly 3 specialists |
| Functional correctness | Strong (post-fix) | Stuck-busy lockup, stale confidence, dropped re-audit, duplicate-id crash all resolved (H1, M1, M3, M7) |
| Concurrency / interruption | Strong (post-fix) | Actions gated on global busy + aborts reset to idle; queued re-audit uses the current controller (H2, M3) |
| Error handling | Strong | `toAppError` taxonomy + inline retry + global handler; aborts now reset to idle instead of erroring |
| UX / journeys | Strong (post-fix) | Failed-refine banner + self-heal transparency added; offline handling (L1) still generic |
| Accessibility | Adequate | aria-live + labels present; missing `<main>`/skip-link; tooltip content not AT-reachable |
| Performance / bundle | Strong | 128 kB gzip initial, lazy everything; no obvious re-render hotspots |
| Security / privacy | Good (with 1 gap) | BYOK, sanitized rendering, `script-src 'self'`; plaintext key in localStorage (M9, accepted BYOK trade-off) |
| Testing / CI | Partial | 142 unit specs + angular-eslint lint + Node `engines`/`.nvmrc` pin; no e2e; CI intentionally out of scope |

---

## 2. Severity summary

| # | Severity | Category | Title | Confidence |
|---|---|---|---|---|
| H1 | High | Bug / Reliability | ✅ **Fixed** — Planner `needed:true` + empty `brief` → permanent "busy" lockup | High |
| H2 | High | Bug / UX | ✅ **Fixed** — Concurrent actions abort in-flight work and surface spurious "Request cancelled" widgets | High |
| M1 | Medium | Bug / UX | ✅ **Fixed** — Manual refine leaves the confidence badge stale (old score on new content) | High |
| M2 | Medium | Bug / UX | ✅ **Fixed** — Failed refine on an existing widget shows no error/retry (stays "Done") | High |
| M3 | Medium | Bug | ✅ **Fixed** — Concurrent `audit()` calls are silently dropped (stale-signal guard) | Medium |
| M4 | Medium | Bug / Privacy | ✅ **Fixed** — Voice recognition never stopped on destroy; permission errors are silent | High |
| M5 | Medium | Cost / UX | ✅ **Fixed** — Auto self-heal spends the user's tokens with no consent or visibility | High |
| M6 | Medium | Security | ✅ **Fixed** — `script-src 'unsafe-inline'` undercuts the "strict CSP" while key is in localStorage | High |
| M7 | Medium | Bug | ✅ **Fixed** — Duplicate auditor issue `id`s crash the audit ribbon (`@for` NG0955) | Medium |
| M8 | Medium | Bug / UX | ✅ **Fixed** — `retryAgent('planner')` re-plans but never re-runs specialists | Medium |
| M9 | Medium | Security / Privacy | API key stored plaintext in `localStorage`, last-4 always on screen | High (design) |
| L1 | Low | Reliability / UX | No offline / network-loss handling beyond a generic toast | Medium |
| L2 | Low | Process | ✅ **Fixed** (ESLint) — angular-eslint added + `lint` script; CI intentionally out of scope | High |
| L3 | Low | Process | ✅ **Fixed** — `engines` pin for Node ≥ 22.22.3 + `.nvmrc` | High |
| L4 | Low | Accessibility | Missing `<main>`/skip-link; confidence weaknesses not keyboard/AT reachable | Medium |
| L5 | Low | Perf / Cost | ✅ **Fixed** — prompt length cap (`maxlength` + soft warning) in the Command Center | Medium |
| L6 | Low | Bug (edge) | ✅ **Fixed** — currency code normalized via `safeCurrencyCode` before `CurrencyPipe` | Low |
| L7 | Low | Code Quality | ✅ **Fixed** — `pulseTimer` cleared on `WidgetShell` destroy | Medium |
| L8 | Low | UX polish | Stale "attached" chip after run; intake row/samples not disabled during interpret | Medium |
| L9 | Low | Docs | ✅ **Fixed** — README CSP/self-heal/test-count reconciled with actual behavior | High |
| S1 | Note | Scalability | Pipeline hard-coded to exactly three specialists across many switch/maps | High |

---

## 3. Detailed findings

### H1 — Planner returns `needed: true` with an empty brief → permanent "busy" lockup
- **Status:** ✅ **Fixed (2026-07-03)** — `run()` now derives a single `dispatchable` set (`needed && brief.trim()`) and only marks *those* `pending`, so a needed-but-empty-brief agent stays `idle` and the pipeline settles. Covered by `agent-orchestrator.service.spec.ts` → *"never leaves a needed-but-empty-brief agent stuck 'pending'"*.
- **Severity:** High · **Category:** Bug / Reliability · **Confidence:** High
- **Location:** `src/app/core/ai/agent-orchestrator.service.ts` — `run()`

The set-to-pending predicate and the dispatch predicate differ. An agent is marked `pending` when `a.needed`, but only dispatched when `a.needed && a.brief.trim().length > 0`:

```104:115:src/app/core/ai/agent-orchestrator.service.ts
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
```

- **Description:** If the model returns an agent with `needed: true` but a blank/whitespace `brief` (LLMs do this even under a `responseSchema`), that agent is set to `pending` but never dispatched. Its status stays `pending` forever.
- **Impact:** `globalStatus` treats any `pending` worker as `running` (`agent.store.ts` lines 97–100), so `isBusy()` stays `true` **permanently** — the submit button, sample chips, and refine bars all stay disabled, the Control Tower spins forever, and the only recovery is a page reload. A single malformed plan bricks the session.
- **Recommended fix:** Use one predicate. Compute the dispatchable set first and only mark those `pending`:

```ts
const dispatchable = plan.agents.filter((a) => a.needed && a.brief.trim().length > 0);
for (const a of dispatchable) {
  this.store.setAgentStatus(a.id, 'pending');
  this.store.setAgentBrief(a.id, a.brief);
}
const tasks = dispatchable.map((a) => this.dispatch(a.id, a.brief, undefined, signal));
```

Optionally, treat a `needed` agent with an empty brief as a planner defect and fall back to the raw user brief for that slot.

---

### H2 — Concurrent user actions abort all in-flight work and surface spurious "Request cancelled" widgets
- **Status:** ✅ **Fixed (2026-07-03)** — Implemented recommendations (1) and (2). (1) `agent-base` now resets an aborted agent to `idle` (not `error`), so cancellations never render as "Request cancelled" shells. (2) All user-initiated actions are single-flighted on global `store.isBusy()` — in the UI (`RefineBar`, `AuditRibbon` apply/re-audit, widget-shell "Update") **and** as a defensive guard at the top of `refine`/`applyFixIt`/`rippleUpdate`/`reAudit` — so overlaps can't start an abort in the first place. Recommendation (3) (per-widget controllers) remains a longer-term option but is now unnecessary for correctness. Covered by `agent-base.spec.ts` (abort → idle) and `agent-orchestrator.service.spec.ts` (busy guards).
- **Severity:** High · **Category:** Bug / UX · **Confidence:** High
- **Location:** `agent-orchestrator.service.ts` (`freshSignal`), `agents/agent-base.ts` (catch), `features/widgets/refine-bar.ts`, `features/audit-ribbon/audit-ribbon.ts`

Three design choices combine into a real bug:
1. There is **one** shared `AbortController`; any new action aborts everything in flight:

```71:75:src/app/core/ai/agent-orchestrator.service.ts
  private freshSignal(): AbortSignal {
    this.currentController?.abort();
    this.currentController = new AbortController();
    return this.currentController.signal;
  }
```

2. Per-widget actions are gated only on **their own** status, not global busy. `RefineBar.inFlight` checks only the widget's own state, so a user can refine an already-rendered widget while other specialists/the auditor are still streaming:

```63:66:src/app/features/widgets/refine-bar.ts
  protected readonly inFlight = computed(() => {
    const s = this.status();
    return s === 'thinking' || s === 'streaming' || s === 'pending';
  });
```

3. An aborted stream is caught and recorded as a widget **error** (an `AbortError` becomes a user-facing `AppError` of kind `aborted` → "Request cancelled"):

```105:110:src/app/core/ai/agents/agent-base.ts
    } catch (err) {
      const usage = usageFromMetadata(lastUsage);
      if (usage) this.store.recordAgentUsage(this.id, usage, model);
      this.store.setAgentStatus(this.id, 'error', toAppError(err));
      throw err;
    }
```

- **Description:** Refining widget A mid-run (or applying a fix-it, or clicking "Update"/"Re-audit") calls `freshSignal()`, which aborts the still-running specialists and the auditor. Those aborted agents flip to `error`. Any agent whose widget hadn't rendered yet then shows an **error shell reading "Request cancelled"**; the auditor shows "Failed".
- **Impact:** The dashboard appears broken after an ordinary interaction — cancelled-by-design work looks like failures. This is easy to hit in a live demo (finish budget, immediately refine it while venue is still grounding via Search).
- **Recommended fix (layered):**
  1. In `agent-base` catch, do **not** set `error` for aborts: `if (opts.signal?.aborted || isAbortError(err)) { this.store.setAgentStatus(this.id, 'idle'); throw err; }` (or add a dedicated non-error `cancelled` status).
  2. Gate user-initiated actions (`RefineBar`, audit-ribbon `applyFix`/`reAudit`, stale "Update") on global `store.isBusy()` in addition to per-target status, so overlaps can't start.
  3. Longer term, consider per-operation `AbortController`s keyed by widget so an intentional refine of A doesn't cancel unrelated in-flight B.

---

### M1 — Manual refine leaves the confidence badge stale
- **Status:** ✅ **Fixed (2026-07-03)** — Added `AgentStore.clearWidgetConfidence(id)`; `refine()` calls it on a successful dispatch so the badge/weakness tooltip disappear until the next audit (which the user can trigger via "Re-audit"). Covered by `agent.store.spec.ts` → *"clearWidgetConfidence drops only the target widget"* and `agent-orchestrator.service.spec.ts` → *"clears a widget confidence after a successful manual refine"*.
- **Severity:** Medium · **Category:** Bug / UX · **Confidence:** High
- **Location:** `agent-orchestrator.service.ts` `refine()`; `state/agent.store.ts` `widgetConfidence`; `features/widgets/widget-shell.ts`

`refine()` intentionally does **not** re-audit (only marks downstreams stale) and never clears `widgetConfidence`:

```122:139:src/app/core/ai/agent-orchestrator.service.ts
  /** Marks downstream widgets stale on success; does not auto-ripple or re-audit. */
  async refine(widgetId: SpecialistId, deltaPrompt: string): Promise<void> {
    ...
    const ok = await this.dispatch(widgetId, deltaPrompt, existing.payload.config, signal);
    if (ok) {
      for (const d of directDependentsOf(widgetId)) {
        if (this.store.getWidget(d)) this.store.markStale(d);
      }
    }
    this.store.touchRunWallEnded();
  }
```

- **Description:** After the user refines a widget, its content changes but the green/amber/rose confidence badge (and its weakness tooltip) still reflect the **previous** audit of the **previous** content.
- **Impact:** The quality signal — the whole point of Feature 4 — becomes misleading exactly when the user is actively editing. A widget the user just fixed can keep showing "62% · missing contingency" even though contingency was added.
- **Recommended fix:** On a successful refine, clear that widget's confidence (`store.clearWidgetConfidence(id)` — add a small setter) so the badge disappears until the next audit, and/or mark the badge "stale" visually. Cheapest correct option: clear it; the user can hit "Re-audit" to regenerate.

---

### M2 — Failed refine on an existing widget shows no error affordance
- **Status:** ✅ **Fixed (2026-07-03)** — The slot keeps the previous content (`mode` stays `real`), but `WidgetShell` now detects `mode==='real' && status==='error'` (`hasInlineError`) and renders an inline "Update failed — showing the previous version." banner with the sanitized message and a Retry button (when the error is retryable). The header pill also flips from "Done" to "Update failed" and the (now-stale) confidence pill is hidden. See `features/widgets/widget-shell.{ts,html,scss}`.
- **Severity:** Medium · **Category:** Bug / UX · **Confidence:** High
- **Location:** `features/renderer/widget-slot.ts` (`mode`), `features/widgets/widget-shell.html`

`WidgetSlot.mode` is `'real'` whenever a widget object exists, regardless of the agent's error status:

```51:55:src/app/features/renderer/widget-slot.ts
  protected readonly mode = computed<SlotMode>(() => {
    if (this.widget()) return 'real';
    if (this.store.agentStates()[this.slotId()].status === 'error') return 'error';
    return 'ghost';
  });
```

- **Description:** If a refine/ripple/self-heal on an **already-rendered** widget fails, the widget keeps its old content and shows the "Done" pill. The only failure signal is a transient snackbar; there is no inline error state and no per-widget retry (the retry button lives only in the `error` shell).
- **Impact:** Users believe a refine succeeded when it silently failed; the displayed data is stale. Recovery requires re-typing the refine.
- **Recommended fix:** When a widget exists but its agent status is `error`, surface an inline banner on the real shell (similar to the stale banner) with the sanitized message + a Retry action, or fall the slot back to `error` mode with a "keep previous" option.

---

### M3 — Concurrent `audit()` calls are silently dropped
- **Status:** ✅ **Fixed (2026-07-03)** — The single-flight re-run in the `finally` block now re-reads `this.currentController?.signal` (the *current* controller) instead of the captured `signal`, and guards on that signal's `aborted` state. A user "Re-audit" that queued behind an in-flight audit (aborting the original signal via `freshSignal()`) now actually runs.
- **Severity:** Medium · **Category:** Bug · **Confidence:** Medium
- **Location:** `agent-orchestrator.service.ts` `audit()`

```268:297:src/app/core/ai/agent-orchestrator.service.ts
  private async audit(signal?: AbortSignal): Promise<void> {
    if (this.auditInFlight) {
      this.pendingAudit = true;
      return;
    }
    ...
    } finally {
      this.auditInFlight = false;
      this.store.touchRunWallEnded();
      if (this.pendingAudit && !signal?.aborted) {
        this.pendingAudit = false;
        await this.audit(signal);
      }
    }
  }
```

- **Description:** The single-flight guard re-runs a pending audit using the **first caller's** `signal`. If a second action (e.g., user clicks "Re-audit", or `applyFixIt`) starts while an audit is in flight, it calls `freshSignal()` first — which aborts the original signal — then calls `audit()`, which sees `auditInFlight` and only sets `pendingAudit`. When the in-flight audit finishes, the `!signal?.aborted` check is false (that original signal is now aborted), so the queued audit is **skipped entirely**.
- **Impact:** A user-requested re-audit can be dropped with no feedback; the ribbon keeps showing stale results.
- **Recommended fix:** Track the pending audit against the **current** controller/signal, not the captured one, or simply re-read `this.currentController.signal` when running the queued audit; guard on `this.currentController?.signal.aborted`.

---

### M4 — Voice recognition is never stopped on destroy; permission errors are silent
- **Status:** ✅ **Fixed (2026-07-03)** — `CommandCenter` now registers `DestroyRef.onDestroy(() => this.stopVoice())` and calls `stopVoice()` on `submit()`, so the mic can't stay live after leaving the screen or starting a run. `onerror` now receives the error code and surfaces friendly toasts for `not-allowed`/`service-not-allowed` (blocked permission), `audio-capture` (no mic), and `network`, while staying silent on benign `no-speech`/`aborted`.
- **Severity:** Medium · **Category:** Bug / Privacy / UX · **Confidence:** High
- **Location:** `features/command-center/command-center.ts`

```185:212:src/app/features/command-center/command-center.ts
  private startVoice(): void {
    ...
    rec.onerror = () => this.listening.set(false);
    rec.onend = () => this.listening.set(false);
    this.recognition = rec;
    this.listening.set(true);
    rec.start();
  }

  private stopVoice(): void {
    this.recognition?.stop();
    this.recognition = null;
    this.listening.set(false);
  }
```

- **Description:** There is no `DestroyRef`/`ngOnDestroy` cleanup, so navigating away (or a key clear) while dictating leaves `SpeechRecognition` running — the **microphone stays active**. Also, `onerror` (permission denied, `no-speech`, network) just flips `listening` off with **no user feedback**, so clicking the mic and denying permission appears to do nothing.
- **Impact:** Privacy (mic left on after leaving the screen) and confusing UX on the most demo-visible new control.
- **Recommended fix:** `inject(DestroyRef).onDestroy(() => this.stopVoice())`; in `onerror`, surface a friendly notification for `not-allowed`/`service-not-allowed` and distinguish benign `no-speech`. Also stop recognition on `submit()`.

---

### M5 — Auto self-heal spends the user's tokens with no consent or visibility
- **Status:** ✅ **Fixed (2026-07-03)** — Added a persisted `SettingsService.autoHeal` (localStorage, default on) with an "auto-repair" toggle in the Control Tower header; `maybeSelfHeal()` returns early when it's off, making the extra spend opt-out. When a heal runs, it now announces itself with a before → after confidence toast (e.g. "Auto-repaired Budget agent 30% → 90%"). Covered by `settings.service.spec.ts` and `agent-orchestrator.service.spec.ts` → *"does not self-heal when the auto-repair setting is off"* and *"announces a heal with a before → after confidence toast"*.
- **Severity:** Medium · **Category:** Cost / UX · **Confidence:** High
- **Location:** `agent-orchestrator.service.ts` `maybeSelfHeal()` (runs automatically at the end of every `run()`)

```305:326:src/app/core/ai/agent-orchestrator.service.ts
  private async maybeSelfHeal(signal: AbortSignal): Promise<void> {
    const healed: SpecialistId[] = [];
    for (const id of SPECIALIST_IDS) {
      ...
      const repairBrief = buildRepairPrompt(confidence.weaknesses);
      const ok = await this.dispatch(id, repairBrief, widget.payload.config, signal);
      if (ok) healed.push(id);
    }
    if (healed.length && !signal.aborted) await this.audit(signal);
  }
```

- **Description:** Whenever any widget scores `< 0.6`, the app automatically issues a repair generation **plus a second full audit** — extra paid Gemini calls on the user's own key — with no opt-in, no setting to disable, and only an implicit "Refining…" pulse to signal it. This is well-bounded (1 heal/widget/run) but invisible and non-consensual from a cost standpoint.
- **Impact:** Silent extra spend and latency on the user's quota; on a metered key this is real money. It also makes runs non-deterministic for demos.
- **Recommended fix:** Make auto-heal opt-in (a toggle, default on for demo / off for BYOK), and surface it explicitly ("Auto-repaired Budget — confidence 58% → 84%") via a toast or a Control Tower line. Expose `CONFIDENCE_THRESHOLD` / `MAX_SELF_HEALS_PER_WIDGET` as user-visible settings.

---

### M6 — `script-src 'unsafe-inline'` undercuts the "strict CSP" claim
- **Status:** ✅ **Fixed (2026-07-03)** — `script-src` is now `'self'` (no `'unsafe-inline'`). The inline anti-FOUC theme script moved to a self-hosted, same-origin `public/theme-init.js`, and critical-CSS inlining was disabled in the production build (`angular.json` → `optimization.styles.inlineCritical: false`) to eliminate the last inline handler (beasties' `onload="this.media='all'"` on the deferred stylesheet). Verified against the built `dist/maestro/browser/index.html`: no inline `<script>` and no inline event handlers remain; `style-src 'unsafe-inline'` is intentionally retained for Angular Material.
- **Severity:** Medium · **Category:** Security · **Confidence:** High
- **Location:** `src/index.html`

```10:12:src/index.html
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none';"
    />
```

- **Description:** `'unsafe-inline'` in `script-src` (present to allow the inline anti-FOUC theme script) permits arbitrary inline script execution, defeating a primary XSS mitigation. This matters because the Gemini API key lives in `localStorage` (readable by any script on the origin), so an injected inline script could exfiltrate it. The README advertises a "strict CSP."
- **Impact:** Larger XSS blast radius than advertised; key exfiltration risk if any injection vector is ever introduced.
- **Recommended fix:** Remove `'unsafe-inline'` from `script-src` by hashing the inline theme script (`script-src 'self' 'sha256-…'`) or moving it to a self-hosted `theme-init.js`. (`style-src 'unsafe-inline'` is harder to drop due to Angular Material and is a more accepted trade-off.)

---

### M7 — Duplicate auditor issue `id`s crash the audit ribbon
- **Status:** ✅ **Fixed (2026-07-03)** — `AgentStore.setAuditResult` now passes issues through a `dedupeIssueIds` helper that makes ids unique (suffixing collisions `-2`, `-3`, …) and backfills blank ids, so `@for … track issue.id` can never hit NG0955. Deduping (rather than `track $index`) preserves `dismissAuditIssue`, which keys by id. Covered by `agent.store.spec.ts` → *"deduplicates model-generated ids"* and *"backfills a stable id for blank ids"*.
- **Severity:** Medium · **Category:** Bug · **Confidence:** Medium
- **Location:** `features/audit-ribbon/audit-ribbon.html` (`@for … track issue.id`); ids are model-generated

```66:66:src/app/features/audit-ribbon/audit-ribbon.html
        @for (issue of auditIssues(); track issue.id) {
```

- **Description:** `issue.id` is a free-form kebab string produced by the LLM (`AUDITOR_SCHEMA`). If two issues share an id, Angular's `@for` throws NG0955 ("duplicated keys"), which breaks rendering of the ribbon.
- **Impact:** A malformed audit payload can crash the audit surface for the whole run.
- **Recommended fix:** Dedupe/normalize ids in `AgentStore.setAuditResult` (e.g., suffix collisions with an index), or `track $index`. Deduping is preferable because `dismissAuditIssue` also keys by id.

---

### M8 — `retryAgent('planner')` re-plans but never re-runs the specialists
- **Status:** ✅ **Fixed (2026-07-03)** — The planner branch of `retryAgent()` now mirrors `run()`: after a successful (or fallback) re-plan it computes the `dispatchable` set, re-dispatches those specialists, and re-audits, so the rendered widgets track the new plan instead of silently diverging. Covered by `agent-orchestrator.service.spec.ts` → *"re-dispatches specialists and re-audits when the planner is retried"*.
- **Severity:** Medium · **Category:** Bug / UX · **Confidence:** Medium
- **Location:** `agent-orchestrator.service.ts` `retryAgent()`

```216:238:src/app/core/ai/agent-orchestrator.service.ts
    if (id === 'planner') {
      const intent = this.store.lastUserIntent();
      if (!intent) return;
      try {
        const plan = await this.planner.plan(intent, signal);
        this.store.setPlannerRationale(plan.rationale);
        for (const a of plan.agents) {
          if (a.needed) this.store.setAgentBrief(a.id, a.brief);
        }
      } catch { ... }
      this.store.touchRunWallEnded();
      return;
    }
```

- **Description:** Retrying the planner regenerates the rationale and per-agent briefs but never dispatches the specialists, so the widgets keep whatever content they had (often built from the earlier fallback "raw brief"). The new briefs are stored but unused.
- **Impact:** "Retry" on the planner looks like it did nothing meaningful; the plan and the rendered widgets diverge.
- **Recommended fix:** After a successful re-plan, re-dispatch the needed specialists (mirroring `run()`), then audit — or relabel the action so its scope is clear.

---

### M9 — API key stored in plaintext `localStorage`, last-4 always on screen
- **Severity:** Medium · **Category:** Security / Privacy · **Confidence:** High (this is an inherent BYOK trade-off; impact is Medium)
- **Location:** `core/auth/api-key.service.ts` (`KEY_STORAGE`), `app.html` (masked key in topbar)

- **Description:** The key is persisted unencrypted in `localStorage` and is readable by any script on the origin; the last 4 characters are always rendered in the topbar. This is a deliberate, documented BYOK/no-backend design, but it remains the app's most sensitive asset and is only as safe as the origin's XSS posture (see M6).
- **Impact:** Any XSS, malicious dependency, or shared-machine access can read the full key; over-the-shoulder observers see the last 4.
- **Recommended fix:** Keep BYOK, but (a) close M6 so XSS can't trivially read it; (b) offer a "don't persist (session only)" option; (c) consider `sessionStorage` default and an explicit "remember on this device" opt-in; (d) hide the last-4 behind hover/click. Document the residual risk plainly.

---

### L1 — No offline / network-loss handling beyond a generic toast
- **Severity:** Low · **Category:** Reliability / UX · **Confidence:** Medium
- **Location:** app-wide (no `navigator.onLine` usage found)
- **Description:** With no connection, agents fail into the generic `network` `AppError` only after the request errors; there's no proactive offline banner, no pre-flight check, and no distinction between "you're offline" and "Gemini is down."
- **Impact:** Slower, more confusing failure for users on flaky/no networks.
- **Recommended fix:** Listen to `online`/`offline`, show a persistent offline banner, and disable submit while offline with a clear message.

---

### L2 — No ESLint config and no CI pipeline
- **Status:** ✅ **Fixed (2026-07-03), ESLint portion** — Added `angular-eslint` (v22, flat config `eslint.config.js`) via `ng add`, with `typescript-eslint` recommended+stylistic and Angular template + accessibility rules; selector prefixes set to `['app','dea']`; `dist`/`.angular` ignored. Added an `npm run lint` script. Fixing the one surfaced error also removed dead code (`RENDER_TYPE_BY_ID` in `widget.types.ts`). Repo currently lints clean. **CI is intentionally out of scope per the maintainer** — no workflow was added.
- **Severity:** Low · **Category:** Process / Code Quality · **Confidence:** High
- **Location:** repo root (`package.json` scripts; no `.eslintrc*`, no `.github/workflows`)
- **Description:** Only `prettier` + `vitest` are configured; there is no linter and nothing runs tests/build on push/PR.
- **Impact:** Regressions and style drift can land unnoticed; the 142 specs aren't auto-enforced on push/PR.
- **Recommended fix:** Add `angular-eslint`, a `lint` script, and a CI workflow running `lint`, `test --watch=false`, and `build` on PRs.

---

### L3 — No `engines` pin for Node ≥ 22.22.3
- **Status:** ✅ **Fixed (2026-07-03)** — Added `"engines": { "node": ">=22.22.3" }` to `package.json` and an `.nvmrc` (`22.22.3`); README prerequisites note the pin and `nvm use`.
- **Severity:** Low · **Category:** Process · **Confidence:** High
- **Location:** `package.json`
- **Description:** Angular 22 requires Node ≥ v22.22.3 / v24.15 / v26, but there is no `engines` field; a contributor on Node 20 hits a hard failure with no guardrail (observed during this review).
- **Recommended fix:** Add `"engines": { "node": ">=22.22.3" }` and an `.nvmrc`; optionally `engine-strict`.

---

### L4 — Accessibility gaps: landmarks and non-reachable tooltip content
- **Severity:** Low · **Category:** Accessibility · **Confidence:** Medium
- **Location:** `app.html` (no `<main>`, no skip-link), `features/widgets/widget-shell.html` (confidence pill)
- **Description:** The routed content isn't wrapped in a `<main>` landmark and there's no skip-to-content link. The confidence badge is a non-focusable `<span>` whose weakness list lives only in a hover `matTooltip`; the `aria-label` announces only the percentage, so screen-reader/keyboard users can't get the weaknesses.
- **Recommended fix:** Wrap `<router-outlet>` in `<main>`, add a skip link, and expose the weaknesses via an accessible description (e.g., visually-hidden text or an expandable) rather than tooltip-only.

---

### L5 — No prompt length cap in the Command Center
- **Status:** ✅ **Fixed (2026-07-03)** — Added a `maxPromptChars` (4000) cap: the textarea now enforces `maxlength`, the counter shows `n / 4000` and turns amber/red with a "approaching limit"/"trim to submit" hint (`nearLimit`/`overLimit`), `canSubmit` blocks over-limit briefs, and dictation (which bypasses `maxlength`) is truncated to the cap.
- **Severity:** Low · **Category:** Performance / Cost · **Confidence:** Medium
- **Location:** `features/command-center/command-center.ts` / `.html`
- **Description:** `charCount` is shown but there's no `maxlength`; an accidental paste of a huge document goes straight to the Planner, inflating tokens/latency/cost.
- **Recommended fix:** Add a sensible `maxlength` (and a soft warning near the cap); the multimodal intake path already funnels large docs into a summarized brief.

---

### L6 — `CurrencyPipe` with an invalid model-supplied currency code
- **Status:** ✅ **Fixed (2026-07-03)** — Added `core/format/currency.ts` → `safeCurrencyCode()` (passes through well-formed 3-letter ISO codes uppercased, else falls back to `USD`). Budget and Venue widgets now bind a `currencyCode` computed instead of the raw model string. Covered by `currency.spec.ts`.
- **Severity:** Low · **Category:** Bug (edge) · **Confidence:** Low
- **Location:** `features/widgets/budget-widget.*`, `venue-widget.*`
- **Description:** Budget/venue render amounts with `CurrencyPipe` using the model's `currency` string. A non-ISO value (e.g., "Rs", "rupees", empty) can render oddly or throw an invalid-argument error.
- **Recommended fix:** Validate/normalize the currency code (fallback to `USD`/`INR`) before binding, or wrap in a safe formatter.

---

### L7 — `pulseTimer` not cleared on `WidgetShell` destroy
- **Status:** ✅ **Fixed (2026-07-03)** — `WidgetShell` now injects `DestroyRef` and clears the pending `pulseTimer` in `onDestroy`.
- **Severity:** Low · **Category:** Code Quality · **Confidence:** Medium
- **Location:** `features/widgets/widget-shell.ts` (`firePulse`)
- **Description:** The 700 ms pulse `setTimeout` isn't cleared on destroy; if the widget is torn down mid-pulse the timer fires against a destroyed component (benign with signals, but sloppy).
- **Recommended fix:** Clear it in a `DestroyRef.onDestroy`.

---

### L8 — Intake polish: stale "attached" chip; controls not disabled during interpret
- **Severity:** Low · **Category:** UX polish · **Confidence:** Medium
- **Location:** `features/command-center/command-center.*`
- **Description:** After a run, the green "attached: filename" chip persists (it isn't cleared on submit/reset). Sample chips and the hero button check only `isBusy()`, so they remain clickable during `interpreting()` and can overwrite the draft mid-interpretation.
- **Recommended fix:** Clear `attachmentName` on submit/clear; include `interpreting()` in the guards for sample/hero clicks.

---

### L9 — README/docs drift from actual CSP and self-heal cost
- **Status:** ✅ **Fixed (2026-07-03)** — README now describes the actual CSP (`script-src 'self'`, self-hosted theme script, `style-src 'unsafe-inline'` retained for Material), documents confidence scoring + opt-out auto-repair and its cost, adds the `npm run lint` command and the `engines`/`.nvmrc` pin, refreshes the test counts (142 across 16 files), and lists the new `format/`/`settings/`/`intake/` modules.
- **Severity:** Low · **Category:** Docs · **Confidence:** High
- **Location:** `README.md` "Bundle & security"
- **Description:** README says CSP `connect-src` is "limited to `generativelanguage.googleapis.com`" and calls the CSP "strict," but the policy also allows `'self'` and, more importantly, `script-src 'unsafe-inline'` (M6). Self-heal now spends extra tokens (M5) which isn't documented.
- **Recommended fix:** Reconcile the docs with the actual policy after fixing M6, and document self-heal's cost behavior.

---

### S1 — Note: pipeline hard-coded to exactly three specialists
- **Severity:** Note · **Category:** Scalability / Code Quality · **Confidence:** High
- **Location:** `types/widget.types.ts` (`intoComponentConfig` switch), `ai/ripple.ts`, `control-tower.ts` (`ROW_META`), schemas/prompts
- **Description:** Budget/Schedule/Venue are enumerated across many places (union types, switch statements, ripple graph, row metadata, prompts). Adding a fourth specialist touches ~8 files.
- **Impact:** Fine for the current demo scope, but a growth tax. Not a bug.
- **Recommended fix:** If the roadmap adds specialists, introduce a registry/descriptor keyed by `SpecialistId` (component loader, schema, prompt, ripple deps, meta) so new agents are data, not code edits.

---

## 4. Prioritized action plan

**Fix before any real-user release (P0): ✅ DONE (2026-07-03)**
1. ✅ **H1** — Made the pending/dispatch predicates identical; stuck-busy lockup eliminated.
2. ✅ **H2** — Aborts no longer classified as widget errors; user actions gated on global `isBusy()` (UI + orchestrator guard).
3. ✅ **M6** — Removed `script-src 'unsafe-inline'` via a self-hosted theme script + disabled critical-CSS inlining. localStorage key no longer exposed to inline-script injection.

**Fix before calling it production-ready (P1): ✅ DONE (2026-07-03)**
4. ✅ **M1** — Refine clears the stale confidence badge (`clearWidgetConfidence`).
5. ✅ **M2** — Failed refine on a rendered widget shows an inline "Update failed" banner + Retry.
6. ✅ **M4** — Voice recognition stopped on destroy/submit; permission/hardware/network errors surfaced.
7. ✅ **M5** — Auto self-heal is opt-out (Control Tower toggle, persisted) and announces before → after confidence.
8. ✅ **M7** — Auditor issue ids de-duplicated in `setAuditResult`.
9. ✅ **M3** — Queued audit re-runs against the current controller (concurrent re-audit no longer dropped).
10. ✅ **M8** — Planner retry now re-dispatches specialists and re-audits.

**Hardening & polish (P2):**
11. **M9** — Offer session-only key storage + hide last-4; document residual risk. *(Open.)*
12. ✅ **L2** ESLint (angular-eslint + `lint` script; CI intentionally skipped) · ✅ **L3** Node `engines` pin + `.nvmrc` · ✅ **L5** prompt cap · ✅ **L6** currency normalization · ✅ **L7** `pulseTimer` cleanup · ✅ **L9** docs reconciled — **done (2026-07-03)**.
13. Still open: **L1** offline UX · **L4** a11y landmarks/tooltip · **L8** intake polish (stale attach chip / interpret-time guards).

**Roadmap consideration:** **S1** registry refactor if/when specialists grow.

---

## 5. Production-readiness risks (release gate)

Must be resolved (or explicitly accepted) before a public "production" release:

- **Reliability lockup (H1):** ✅ **Resolved (2026-07-03)** — malformed plans can no longer freeze the session.
- **Interruption correctness (H2, M3):** ✅ **Resolved (2026-07-03)** — overlapping actions are single-flighted, cancellations no longer surface as failures, and a queued concurrent re-audit (M3) now runs against the current controller instead of being dropped.
- **Security posture vs. claims (M6, M9):** ✅ **M6 resolved (2026-07-03)** — `'unsafe-inline'` removed from `script-src`. **M9** (plaintext key in localStorage) remains a documented BYOK design trade-off (P2).
- **Cost consent (M5):** ✅ **Resolved (2026-07-03)** — auto self-heal is now opt-out (persisted toggle) and announces its spend via a before → after confidence toast.
- **Data-quality trust (M1, M2):** ✅ **Resolved (2026-07-03)** — refine clears the stale confidence badge, and a silently-failed refine now shows an inline "Update failed" banner + Retry on the widget.
- **Process safety net (L2, L3):** no CI/lint and no Node pin means regressions and environment breakage can ship unnoticed — add before opening to outside contributors. *(Still open — P2.)*

**Explicitly out of scope / not assessed:** runtime/penetration testing, real Gemini response fuzzing, load/latency under real networks, cross-browser matrix (esp. iOS Safari voice), and localization. Recommend a short manual QA pass covering: first-run onboarding, invalid/expired key, mid-run refine, offline, malformed-plan injection (to validate the H1 fix), and voice permission-denied.

---

## 6. What's already strong (keep it)

- Clean, enforced architecture: `AgentStore` as the single source of truth; `AgentOrchestrator` as the single mutation surface; agents extend a shared streaming base.
- Excellent error taxonomy (`toAppError`) with user-safe copy + technical `detail`, inline retry, and a global handler that de-dupes already-handled errors.
- Consistent cancellation discipline and key-change cancellation via an `effect`.
- Performance hygiene: 128 kB gzip initial, lazy SDK/dialog/widgets/pages, subsetted icon font, visibility-aware ticker.
- Safe rendering: no `innerHTML`/`bypassSecurityTrust`, sanitized `href`s, `rel="noopener noreferrer"` everywhere, `object-src 'none'`, `frame-ancestors 'none'`.
- Solid, idiomatic test suite (142 specs) covering store, schemas, agents, error mapping, telemetry, and the new self-heal/intake/settings/currency logic.
- Thoughtful UX details: ghost/shimmer loading, stale banners, empty states, aria-live status regions, focus management in the refine bar and dialog.

---

## Manual QA Test Scenarios

> **Purpose.** Validate the *entire body of work on this branch* before release. This section is self-contained: a QA engineer with no prior context can execute every case below. It covers both the two new AI features (Multimodal Brief Intake; Confidence Scoring & Self-Healing) and every reliability/security/polish fix and framework migration shipped alongside them.
>
> **How to read a test case.** Each case lists **Test ID**, **Feature/Module**, **Scenario**, **Prerequisites**, **Steps**, **Expected result**, **Priority** (Critical / High / Medium / Low), and **Regression impact** (Yes = exercises pre-existing functionality that these changes could have broken; No = brand-new behavior). LLM output is **non-deterministic** — verify *structure, states, and behavior*, not exact wording of generated content.

### QA.0 — Change catalog under test (scope)

The branch introduces the following. Test IDs that validate each item are noted in brackets.

- **New feature — Multimodal Brief Intake:** voice dictation ("Speak") + "Attach image / PDF" → interpreted, *editable* draft brief in the prompt box, then the normal run pipeline. New `IntakeService` (`core/ai/intake/`). [VOICE-*, FILE-*]
- **New feature — Confidence Scoring & Self-Healing:** Auditor returns per-widget confidence (0–1) + weaknesses; tiered confidence badge on widgets; automatic bounded self-repair of low-confidence widgets with a persisted opt-out toggle + announcement toast. [CONF-*, HEAL-*]
- **Reliability fixes:** stuck-busy lockup on malformed plan (H1) [RUN-04]; aborts no longer render as errors + all user actions single-flighted on global busy (H2) [CONC-*]; queued concurrent re-audit no longer dropped (M3) [AUD-06]; duplicate auditor issue ids de-duped (M7) [AUD-07]; planner retry now re-dispatches specialists + re-audits (M8) [RETRY-02]; refine clears stale confidence (M1) [REF-04]; inline "Update failed" + Retry on a rendered widget (M2) [ERR-*]; voice cleanup + permission errors (M4) [VOICE-*].
- **Security:** CSP `script-src 'self'` (no `'unsafe-inline'`); self-hosted `theme-init.js`; critical-CSS inlining disabled (M6). [SEC-*]
- **Cost/consent:** auto self-heal opt-out toggle + before→after toast (M5). [HEAL-*]
- **Polish/process:** prompt length cap 4000 (L5) [CC-*]; safe currency-code normalization (L6) [CUR-*]; `pulseTimer` cleanup (L7) [WID-07]; ESLint + Node engines pin/.nvmrc (L2/L3) [PROC-*]; README reconciled (L9).
- **Framework migration (Angular v22):** root singletons moved to `@Service()`; three inputs (Command Center brief, Refine bar, API-key dialog) migrated from `ngModel`/`FormsModule` to **Signal Forms** (`[formField]`, native `(submit)`). [DI-*, SF-*]
- **Known still-open items (verify current behavior, not a fix):** M9 plaintext key/last-4 on screen; L1 offline UX; L4 a11y landmarks/tooltip; L8 stale "attached" chip + intake controls not disabled during interpret. [SEC-05, STATE-08, A11Y-03, FILE-08]

### QA.1 — Assumptions & environment setup

1. **Toolchain:** Node **≥ 22.22.3** (repo ships `.nvmrc` = `22.22.3`). Run `nvm use` (or install that Node), then `npm ci`.
2. **Run the app:** `npm start` (alias for `ng serve`) and open the local URL printed in the terminal (Angular default `http://localhost:4200`). Use a production build check separately via `npm run build`.
3. **Process gates (run once):** `npm run lint` must pass clean; `npm test` must pass (expected **142 specs green**); `npm run build` must succeed (one pre-existing bundle/style budget *warning* is acceptable, no errors).
4. **Gemini keys/data to have on hand:**
   - A **valid** Gemini API key with model access (for happy paths). For **Quality mode** the key needs Gemini **Pro** access.
   - An **invalid/expired** key string (for negative validation).
   - Test files: a **small image or PDF containing event details** (e.g., a photographed brief/agenda); an **oversized file > 10 MB**; an **unsupported file** (e.g., `.txt`, `.docx`, `.mp4`).
5. **Browser matrix:** Chrome and Edge (voice supported via Web Speech API); Firefox and Safari (voice **unsupported** → the "Speak" button must be **hidden**). Note iOS Safari voice is unreliable and out of formal scope.
6. **State reset between tests (important — client-only app, no backend):** the app persists state in `localStorage`. To fully reset, open DevTools → Application → Local Storage and remove these keys, then hard-reload:
   - `dea.geminiApiKey` (API key), `dea.geminiModel` (`fast`/`quality`), `dea.theme` (`light`/`dark`), `dea.autoHeal` (`true`/`false`).
   - All in-memory pipeline state (widgets, telemetry, audit) resets on reload or on the next brief submission.
7. **Network control:** use DevTools Network throttling (Slow 3G) and the **Offline** toggle for reliability/loading cases.
8. **Mic control:** control microphone permission via the browser's site settings (Allow / Block / Ask) for voice cases.
9. **Routes:** `/` = marketing home; `/architect` = the workspace. A `?try=<prompt>` query param on `/architect` pre-seeds the brief box.

---

### QA.2 — Onboarding & BYOK API-key management

- **ONB-01 — First-run: no key, workspace shows connect prompt**
  - **Feature/Module:** Onboarding / `WorkspacePage`, `no-key-empty-state`
  - **Scenario:** Happy-path (first-time user, empty state). Fresh visitor with no key opens the workspace.
  - **Prerequisites:** All `dea.*` localStorage keys cleared; hard reload.
  - **Steps:** 1) Navigate to `/architect`.
  - **Expected result:** The "no key" empty state renders (no Command Center / dashboard). Top bar shows a primary **"Connect Gemini key"** button (not a masked-key chip). No console errors.
  - **Priority:** Critical · **Regression impact:** Yes

- **ONB-02 — Home CTAs adapt to key presence**
  - **Feature/Module:** `HomePage`
  - **Scenario:** UI/UX. Home hero + bottom CTA reflect whether a key is connected.
  - **Prerequisites:** No key connected.
  - **Steps:** 1) Go to `/`. 2) Observe hero + "Get started" CTAs. 3) Connect a valid key (ONB-03). 4) Return to `/`.
  - **Expected result:** With no key: primary CTA reads **"Connect a Gemini key to start"** / "Connect Gemini key". With a key: primary CTA becomes **"Try the demo brief"/"Run the demo brief"** linking to `/architect?try=<demo>`.
  - **Priority:** Medium · **Regression impact:** Yes

- **ONB-03 — Connect a valid key (happy path) + validation call**
  - **Feature/Module:** `ApiKeyDialog`, `ApiKeyService.validate`
  - **Scenario:** Happy-path. User pastes a valid key and saves.
  - **Prerequisites:** No key; valid key available.
  - **Steps:** 1) Click "Connect Gemini key". 2) Paste the valid key. 3) Click **Save & validate**.
  - **Expected result:** Button shows a spinner + **"Validating…"** (a cheap `models.list` call runs), then the dialog closes. Top bar shows a masked chip **`••••<last4>`** + a mode pill (**Fast** by default). Workspace now shows the Command Center + empty dashboard state.
  - **Priority:** Critical · **Regression impact:** Yes

- **ONB-04 — Invalid/expired key surfaces inline error, does not save**
  - **Feature/Module:** `ApiKeyDialog`, `ApiKeyService.validate`, `extractGeminiErrorMessage`
  - **Scenario:** Negative. Validation fails.
  - **Prerequisites:** Invalid key string available.
  - **Steps:** 1) Open key dialog. 2) Paste the invalid key. 3) Save & validate.
  - **Expected result:** An inline **error alert** appears with a sanitized, human-readable reason (no raw stack/JSON). Dialog stays open; **no** key is persisted (`dea.geminiApiKey` absent); top bar still shows "Connect Gemini key".
  - **Priority:** High · **Regression impact:** Yes

- **ONB-05 — Empty key blocks save**
  - **Feature/Module:** `ApiKeyDialog`
  - **Scenario:** Edge/validation.
  - **Steps:** 1) Open key dialog with the field empty. 2) Observe Save button. 3) Type spaces only.
  - **Expected result:** **Save & validate** is disabled while the field is empty/whitespace-only (`!draftKey().trim()`).
  - **Priority:** Medium · **Regression impact:** No

- **ONB-06 — Show/hide key visibility toggle**
  - **Feature/Module:** `ApiKeyDialog`
  - **Scenario:** UI/UX + Security (over-the-shoulder).
  - **Steps:** 1) Open dialog, type a key. 2) Toggle the eye icon.
  - **Expected result:** Field toggles between password dots and plaintext; the toggle icon flips `visibility`/`visibility_off`; `aria-label` updates ("Show key"/"Hide key"). Toggle is `tabindex="-1"` (not in tab order).
  - **Priority:** Low · **Regression impact:** No

- **ONB-07 — Quality-mode selection persists**
  - **Feature/Module:** `ApiKeyDialog`, `ApiKeyService.mode`
  - **Scenario:** Happy-path + persistence.
  - **Steps:** 1) Open dialog. 2) Switch **Quality mode** to **Quality**; observe the hint. 3) Save with a valid key. 4) Reload; reopen dialog.
  - **Expected result:** Hint updates to `gemini-3.1-pro-preview · higher quality, needs Pro access` for Quality (vs `gemini-3.5-flash · snappy parallel streaming` for Fast). After save, top-bar mode pill reads **Quality**. After reload, mode is still Quality (`dea.geminiModel=quality`).
  - **Priority:** High · **Regression impact:** Yes

- **ONB-08 — Change key / mode from top bar**
  - **Feature/Module:** `App` top bar, `ApiKeyDialog`
  - **Scenario:** Happy-path (returning user).
  - **Prerequisites:** Key connected.
  - **Steps:** 1) Click the masked-key chip in the top bar. 2) Change mode / re-enter a key. 3) Save.
  - **Expected result:** Dialog opens pre-filled with the existing key and current mode; "Clear saved key" is available; saving updates the chip/mode pill.
  - **Priority:** Medium · **Regression impact:** Yes

- **ONB-09 — Clear saved key returns to onboarding + cancels in-flight work**
  - **Feature/Module:** `ApiKeyService.clearKey`, `AgentOrchestrator` key-change effect
  - **Scenario:** Negative/edge (key removal mid-session).
  - **Prerequisites:** Key connected.
  - **Steps:** 1) Submit a brief so agents are running. 2) While running, open the key dialog and click **Clear saved key**.
  - **Expected result:** Key is removed (`dea.geminiApiKey` gone), top bar reverts to "Connect Gemini key", workspace returns to the no-key empty state, and any in-flight run is aborted (no spurious error toasts persist). No stuck "busy" state.
  - **Priority:** High · **Regression impact:** Yes

- **ONB-10 — localStorage unavailable (private mode) degrades gracefully**
  - **Feature/Module:** `ApiKeyService.setKey` safe-write
  - **Scenario:** Edge (storage blocked).
  - **Prerequisites:** A browser profile with storage blocked, or simulate by making `localStorage.setItem` throw.
  - **Steps:** 1) Connect a valid key.
  - **Expected result:** App still works for the session; a warning toast explains the key couldn't be saved and may need re-entering after reload. No crash.
  - **Priority:** Low · **Regression impact:** No

---

### QA.3 — Signal Forms migration (Command Center brief, Refine bar, API-key input)

- **SF-01 — Command Center brief input is a working Signal Forms control**
  - **Feature/Module:** `CommandCenter` (`[formField]="promptField"`)
  - **Scenario:** Regression (ngModel → Signal Forms). Typing still updates state.
  - **Prerequisites:** Key connected.
  - **Steps:** 1) Type text into the brief textarea. 2) Observe the char counter and Submit button.
  - **Expected result:** Text appears; char counter increments; **Architect Dashboard** enables once there's non-empty text (and key present, not busy, not over limit). No `FormsModule`/`ngModel` regressions (no console binding errors).
  - **Priority:** Critical · **Regression impact:** Yes

- **SF-02 — Brief textarea disabled during a run (schema-driven)**
  - **Feature/Module:** `CommandCenter` `disabled(p, { when: isBusy })`
  - **Scenario:** Edge. Control disabled while busy.
  - **Steps:** 1) Submit a brief. 2) While agents run, try to edit the textarea.
  - **Expected result:** The textarea is disabled (not editable) for the duration of the run; re-enables when the run settles.
  - **Priority:** High · **Regression impact:** Yes

- **SF-03 — Native maxlength enforced via schema (cannot exceed 4000)**
  - **Feature/Module:** `CommandCenter` `maxLength(p, 4000)`
  - **Scenario:** Boundary. Typing/pasting is capped.
  - **Steps:** 1) Paste a >4000-char string into the textarea by typing/keyboard paste.
  - **Expected result:** The textarea's native `maxlength` prevents entering beyond 4000 chars via keyboard/paste. (Programmatic/voice input is handled separately — see CC-03/VOICE-05.)
  - **Priority:** Medium · **Regression impact:** No

- **SF-04 — Enter/⌘(Ctrl)+Enter submit still work after native (submit) migration**
  - **Feature/Module:** `CommandCenter` native `(submit)` + `onKeyDown`
  - **Scenario:** Regression (ngSubmit → native submit).
  - **Steps:** 1) Type a valid brief. 2) Press **⌘+Enter** (mac) / **Ctrl+Enter**. 3) Repeat with a run and verify no double submit.
  - **Expected result:** ⌘/Ctrl+Enter triggers a single run; the page does **not** reload (default prevented). Clicking the button also submits exactly once.
  - **Priority:** High · **Regression impact:** Yes

- **SF-05 — Refine bar input is a working Signal Forms control**
  - **Feature/Module:** `RefineBar` (`[formField]="draftField"`)
  - **Scenario:** Regression.
  - **Prerequisites:** A completed run with at least one rendered widget.
  - **Steps:** 1) Click Refine on a widget. 2) Type an instruction. 3) Submit via Enter and via the button.
  - **Expected result:** Input accepts text; submit applies the refine once; no console binding errors; the page does not reload.
  - **Priority:** High · **Regression impact:** Yes

- **SF-06 — API-key input is a working Signal Forms control, disabled while validating**
  - **Feature/Module:** `ApiKeyDialog` (`[formField]="keyField"`, `disabled when busy`)
  - **Scenario:** Regression + edge.
  - **Steps:** 1) Open dialog, type a key, click Save & validate. 2) During the "Validating…" spinner, try to edit the field.
  - **Expected result:** Typing works normally; during validation the field is disabled; after result it re-enables (on error) or the dialog closes (on success).
  - **Priority:** High · **Regression impact:** Yes

---

### QA.4 — Command Center: brief composition, samples & prompt length cap (L5)

- **CC-01 — Sample/demo chips seed the brief**
  - **Feature/Module:** `CommandCenter` samples, `PromptDraftService`
  - **Scenario:** Happy-path.
  - **Prerequisites:** Key connected; not busy.
  - **Steps:** 1) Click **Demo prompt**. 2) Click another starter chip.
  - **Expected result:** The textarea is populated with that prompt; char counter updates; the chip row is only visible when not busy.
  - **Priority:** Medium · **Regression impact:** Yes

- **CC-02 — `?try=` deep link pre-fills the brief**
  - **Feature/Module:** `HomePage` cards → `/architect?try=`, `PromptDraftService`
  - **Scenario:** Cross-feature (home → workspace).
  - **Prerequisites:** Key connected.
  - **Steps:** 1) On `/`, click any feature card's "Try…" CTA (except BYOK). 2) Land on `/architect`.
  - **Expected result:** The workspace opens with that card's prompt pre-filled in the brief box (draft consumed once). The **BYOK** card instead opens the key dialog.
  - **Priority:** Medium · **Regression impact:** Yes

- **CC-03 — Char counter tiers: normal → near limit → over limit**
  - **Feature/Module:** `CommandCenter` `charCount/nearLimit/overLimit`
  - **Scenario:** Boundary (new cap).
  - **Steps:** 1) Type until ~3600 chars (90%). 2) Continue toward 4000.
  - **Expected result:** Counter reads `n / 4000 chars`. At ≥3600 it turns amber with **"— approaching limit"**. At the 4000 boundary the native cap prevents more typing; if content is programmatically over (voice/paste path) the counter turns red with **"— trim to submit"** and Submit is disabled.
  - **Priority:** Medium · **Regression impact:** No

- **CC-04 — Submit gating (canSubmit) combinations**
  - **Feature/Module:** `CommandCenter.canSubmit`
  - **Scenario:** Negative/edge matrix.
  - **Steps:** Attempt submit when: (a) no key, (b) empty/whitespace brief, (c) while busy, (d) while interpreting a file, (e) over the char limit.
  - **Expected result:** **Architect Dashboard** is disabled in every case (a)–(e); enabled only when key present, non-empty trimmed text, not busy, not interpreting, not over limit.
  - **Priority:** High · **Regression impact:** Yes

- **CC-05 — Clear button**
  - **Feature/Module:** `CommandCenter.clearPrompt`
  - **Scenario:** Happy-path/UI.
  - **Steps:** 1) Type text. 2) Click **Clear**.
  - **Expected result:** Clear appears only when there's text and not busy; clears the textarea and resets the counter to `0 / 4000`.
  - **Priority:** Low · **Regression impact:** Yes

- **CC-06 — Whitespace-only brief is a no-op**
  - **Feature/Module:** `CommandCenter.submit`, `AgentOrchestrator.run` trim guard
  - **Scenario:** Negative/edge.
  - **Steps:** 1) Enter only spaces/newlines. 2) Attempt submit.
  - **Expected result:** No run starts (button disabled and/or `run()` returns on empty trim). No busy state, no network calls.
  - **Priority:** Medium · **Regression impact:** Yes

---

### QA.5 — Multimodal intake: Voice dictation (M4)

- **VOICE-01 — Speak button visibility by browser**
  - **Feature/Module:** `CommandCenter` `voiceSupported`
  - **Scenario:** Cross-browser edge.
  - **Steps:** 1) Open workspace in Chrome/Edge. 2) Repeat in Firefox/Safari.
  - **Expected result:** In Chrome/Edge the **Speak** (mic) chip is present; in browsers without Web Speech API the Speak chip is **hidden** entirely (Attach still shown).
  - **Priority:** Medium · **Regression impact:** No

- **VOICE-02 — Happy-path dictation appends transcript**
  - **Feature/Module:** `CommandCenter.startVoice/appendTranscript`
  - **Scenario:** Happy-path (new feature).
  - **Prerequisites:** Chrome/Edge; mic permission Allowed; key connected.
  - **Steps:** 1) Click **Speak** (label → **Listening…**, chip highlighted). 2) Speak a short brief. 3) Click again to stop.
  - **Expected result:** Final transcript text is appended to the brief (space-separated from any existing text); label returns to **Speak**; the interpreted text is editable before running.
  - **Priority:** High · **Regression impact:** No

- **VOICE-03 — Permission blocked surfaces a warning (M4)**
  - **Feature/Module:** `onVoiceError('not-allowed'/'service-not-allowed')`
  - **Scenario:** Negative.
  - **Prerequisites:** Set mic permission to **Block** for the site.
  - **Steps:** 1) Click **Speak**.
  - **Expected result:** A warning toast: *"Microphone access is blocked. Allow mic permission in your browser to dictate."* The Listening state clears (does not appear stuck). Previously this failed silently — verify it no longer does.
  - **Priority:** High · **Regression impact:** No

- **VOICE-04 — No microphone / network voice errors**
  - **Feature/Module:** `onVoiceError('audio-capture'/'network')`
  - **Scenario:** Negative/edge.
  - **Steps:** 1) With no mic device (or disabled), click Speak → expect *"No microphone was found for voice input."* 2) Simulate a network voice error → expect *"Voice recognition failed due to a network problem."*
  - **Expected result:** Appropriate toast per code; benign `no-speech`/`aborted` produce **no** toast.
  - **Priority:** Medium · **Regression impact:** No

- **VOICE-05 — Dictation respects the 4000-char cap**
  - **Feature/Module:** `appendTranscript … slice(0, maxPromptChars)`
  - **Scenario:** Boundary.
  - **Steps:** 1) Pre-fill the brief near 4000 chars. 2) Dictate more.
  - **Expected result:** Appended text is truncated so total never exceeds 4000; counter shows the cap, not beyond.
  - **Priority:** Low · **Regression impact:** No

- **VOICE-06 — Mic stops on submit and on navigation (M4 privacy)**
  - **Feature/Module:** `submit()` → `stopVoice()`, `DestroyRef.onDestroy`
  - **Scenario:** Negative/privacy (critical fix).
  - **Prerequisites:** Chrome/Edge, mic allowed.
  - **Steps:** 1) Start dictation. 2a) Submit a brief. 2b) In a separate run, start dictation then navigate to `/` (leave the workspace).
  - **Expected result:** In both cases recognition **stops** (browser mic indicator turns off); the mic is not left live after submit or after leaving the screen.
  - **Priority:** High · **Regression impact:** No

---

### QA.6 — Multimodal intake: image / PDF attachment (Feature 3)

- **FILE-01 — Attach a valid image/PDF → editable draft brief (happy path)**
  - **Feature/Module:** `CommandCenter.onFileSelected`, `IntakeService.briefFromFile`
  - **Scenario:** Happy-path (headline feature).
  - **Prerequisites:** Key connected; a small image/PDF describing an event.
  - **Steps:** 1) Click **Attach image / PDF**. 2) Choose the file.
  - **Expected result:** An intake status appears: **"Reading <filename>…"** with a spinner (aria-live). On success the interpreted brief text is placed in the editable textarea (a concise paragraph), and a green **check + filename** "attached" chip shows. User can edit before running. No auto-run.
  - **Priority:** High · **Regression impact:** No

- **FILE-02 — Interpret then run the pipeline**
  - **Feature/Module:** Intake → `AgentOrchestrator.run`
  - **Scenario:** Cross-feature (intake → run).
  - **Steps:** 1) After FILE-01, click **Architect Dashboard**.
  - **Expected result:** The unchanged run pipeline executes on the interpreted text (planner → specialists → auditor). Widgets render.
  - **Priority:** High · **Regression impact:** No

- **FILE-03 — Unsupported file type rejected**
  - **Feature/Module:** `IntakeService.validateFile`
  - **Scenario:** Negative.
  - **Steps:** 1) Attach a `.txt`/`.docx`/`.mp4`.
  - **Expected result:** An error toast: *"Unsupported file. Attach an image (PNG, JPG, WebP) or a PDF."* The "attached" chip is cleared; no interpretation call is made. (Note: the native file picker also filters to `image/*,application/pdf`; test drag of a disallowed type or an OS that bypasses the filter.)
  - **Priority:** High · **Regression impact:** No

- **FILE-04 — Oversized file (> 10 MB) rejected**
  - **Feature/Module:** `IntakeService.validateFile` (`MAX_INTAKE_BYTES`)
  - **Scenario:** Boundary.
  - **Steps:** 1) Attach a file > 10 MB.
  - **Expected result:** Error toast: *"That file is too large. Keep attachments under 10 MB."* No interpretation call; chip cleared.
  - **Priority:** Medium · **Regression impact:** No

- **FILE-05 — Attach without a key**
  - **Feature/Module:** `IntakeService.fromMedia` → `MissingApiKeyError`
  - **Scenario:** Negative. (Reachable if a file is attached before a key exists, e.g., via edge timing.)
  - **Steps:** 1) With no key, trigger `onFileSelected` with a valid image.
  - **Expected result:** A warning toast *"Please connect a Gemini API key first."*; the chip is cleared; no crash.
  - **Priority:** Medium · **Regression impact:** No

- **FILE-06 — Model cannot interpret the document**
  - **Feature/Module:** `IntakeService.fromMedia` empty-text guard
  - **Scenario:** Negative/edge.
  - **Steps:** 1) Attach an image with no readable event content (e.g., a blank/abstract image) so the model returns empty.
  - **Expected result:** A sanitized error toast (interpretation failed / "The document could not be interpreted into a brief."); the "attached" chip is cleared; the app remains usable.
  - **Priority:** Low · **Regression impact:** No

- **FILE-07 — Re-select the same file works**
  - **Feature/Module:** `onFileSelected` resets `input.value`
  - **Scenario:** Edge.
  - **Steps:** 1) Attach a file. 2) Attach the *same* file again.
  - **Expected result:** The second selection re-triggers interpretation (input value cleared so the change event fires again).
  - **Priority:** Low · **Regression impact:** No

- **FILE-08 — Known limitation: stale "attached" chip after a run (L8, open)**
  - **Feature/Module:** `CommandCenter` `attachmentName`
  - **Scenario:** Edge / known open issue — document current behavior.
  - **Steps:** 1) Attach a valid file (chip shows). 2) Run the pipeline. 3) Observe the intake row after the run settles.
  - **Expected result (current):** The green "attached: <filename>" chip **persists** after the run (it is not cleared on submit) — this is a **known open polish item (L8)**, not a release blocker. Log it; do not fail the release on it unless scope says otherwise.
  - **Priority:** Low · **Regression impact:** No

---

### QA.7 — Pipeline run & orchestration

- **RUN-01 — Full happy-path run renders all widgets**
  - **Feature/Module:** `AgentOrchestrator.run`, renderer, `AgentStore`
  - **Scenario:** Happy-path (core flow).
  - **Prerequisites:** Key connected.
  - **Steps:** 1) Submit the demo/HERO brief. 2) Watch the Control Tower + dashboard.
  - **Expected result:** Command Center shows a busy banner ("Planner is decomposing…" then "Specialists are streaming…"). Ghost/shimmer widgets appear, then Budget/Schedule/Venue render with content; auditor runs; run settles to idle. Telemetry footer populates.
  - **Priority:** Critical · **Regression impact:** Yes

- **RUN-02 — Planner rationale shown; specialists dispatched only when needed**
  - **Feature/Module:** `run` dispatchable filter
  - **Scenario:** Happy-path/edge.
  - **Steps:** 1) Submit a brief that clearly needs only some specialists (e.g., "just budget a small meetup, no venue needed").
  - **Expected result:** Control Tower shows the planner rationale; only needed specialists (with non-empty briefs) go Queued→…→Done; not-needed ones stay Standing by. Auditor runs on whatever rendered.
  - **Priority:** High · **Regression impact:** Yes

- **RUN-03 — Planner failure → fallback plan (all specialists on raw brief)**
  - **Feature/Module:** `run` catch → `fallbackPlan`
  - **Scenario:** Negative (planner error).
  - **Prerequisites:** Force a planner error (e.g., Quality mode without Pro access, or throttle to a timeout).
  - **Steps:** 1) Submit a brief that makes the planner call fail.
  - **Expected result:** Rationale reads *"Planner unavailable. Running all specialists on the raw brief."*, planner row shows Done (fallback), and all three specialists run on the raw brief. No stuck busy.
  - **Priority:** High · **Regression impact:** Yes

- **RUN-04 — H1 regression: malformed plan (needed + empty brief) does NOT wedge busy**
  - **Feature/Module:** `run` single dispatchable predicate (H1 fix)
  - **Scenario:** Regression (critical reliability fix).
  - **Prerequisites:** Hard to force with a real model; if a test seam/mock is available, return a plan with an agent `needed:true` but blank `brief`. Otherwise verify indirectly via the unit spec *"never leaves a needed-but-empty-brief agent stuck 'pending'"*.
  - **Steps:** 1) Trigger a plan where a needed agent has an empty brief.
  - **Expected result:** That agent stays **idle** (not perpetually "Queued"); the pipeline settles; **isBusy** returns to false; Submit/refine controls re-enable. No permanent spinner requiring reload.
  - **Priority:** Critical · **Regression impact:** Yes

- **RUN-05 — Partial success: one specialist fails, others render**
  - **Feature/Module:** `globalStatus` partial-success logic, error shell
  - **Scenario:** Negative/edge.
  - **Prerequisites:** Force one specialist to error (throttle / transient).
  - **Steps:** 1) Submit a brief; cause one specialist to fail.
  - **Expected result:** Failed widget shows an **error shell** ("Failed" + message + Retry if retryable); the other widgets render normally; global run still settles (not stuck). Control Tower shows that row as Failed with a Retry.
  - **Priority:** High · **Regression impact:** Yes

- **RUN-06 — New submission resets prior run state**
  - **Feature/Module:** `AgentStore.resetForRun`
  - **Scenario:** Regression.
  - **Steps:** 1) Complete a run. 2) Submit a different brief.
  - **Expected result:** Prior widgets, audit issues, confidence, telemetry, and stale flags are cleared before the new run; the new run starts clean.
  - **Priority:** High · **Regression impact:** Yes

---

### QA.8 — Control Tower, telemetry & per-agent retry

- **CT-01 — Live status transitions + duration ticker**
  - **Feature/Module:** `ControlTower` rows, `liveTick`
  - **Scenario:** Happy-path/UI.
  - **Steps:** 1) Submit a brief and watch the five rows.
  - **Expected result:** Rows transition Standing by → Queued → Thinking → Streaming → Done (labels per `STATUS_LABEL`), with a spinner while live and an incrementing duration. The header dot/state pill reflect PLANNING/RUNNING/DONE/ERROR/IDLE.
  - **Priority:** Medium · **Regression impact:** Yes

- **CT-02 — Ticker pauses when tab hidden (perf)**
  - **Feature/Module:** `ControlTower` visibility check
  - **Scenario:** Performance.
  - **Steps:** 1) Start a run. 2) Switch to another tab for ~5s. 3) Return.
  - **Expected result:** The live duration does not advance while the tab is hidden (interval skips when `document.visibilityState !== 'visible'`); resumes on return.
  - **Priority:** Low · **Regression impact:** Yes

- **CT-03 — Telemetry footer totals**
  - **Feature/Module:** `runTelemetryTotals`, `runWallDurationMs`
  - **Scenario:** Happy-path.
  - **Steps:** 1) Complete a run.
  - **Expected result:** Footer shows total tokens, estimated USD, and wall time, plus the note *"Paid-tier list prices; grounding billed separately."* Per-row token chips appear where usage exists.
  - **Priority:** Low · **Regression impact:** Yes

- **CT-04 — Per-agent retry (specialist) when errored**
  - **Feature/Module:** `ControlTower.retry` → `retryAgent`
  - **Scenario:** Negative recovery.
  - **Prerequisites:** A run where one specialist errored; not busy.
  - **Steps:** 1) Click **Retry** on the failed specialist row.
  - **Expected result:** Only that specialist re-dispatches with its stored brief; on success the widget renders and the row flips to Done. Retry button only shows when errored **and** not busy.
  - **Priority:** High · **Regression impact:** Yes

- **CT-05 — Auditor retry**
  - **Feature/Module:** `retryAgent('auditor')` → `audit`
  - **Scenario:** Negative recovery.
  - **Steps:** 1) With a rendered dashboard and an errored auditor, click Retry on the Auditor row (or the ribbon's Retry).
  - **Expected result:** Auditor re-runs against the current dashboard; issues/confidence refresh.
  - **Priority:** Medium · **Regression impact:** Yes

---

### QA.9 — Widget rendering states

- **WID-01 — Ghost/loading state labels**
  - **Feature/Module:** `WidgetShell` ghost mode
  - **Scenario:** Loading state.
  - **Steps:** 1) Submit a brief; observe widgets before content arrives.
  - **Expected result:** Ghost shells show shimmer blocks and a pill reading **Queued/Thinking…/Streaming…/Preparing…** matching the agent status.
  - **Priority:** Medium · **Regression impact:** Yes

- **WID-02 — Done state**
  - **Feature/Module:** `WidgetShell` real mode
  - **Scenario:** Happy-path.
  - **Expected result:** Rendered widget shows a **Done** pill (check icon) and, once audited, a confidence pill (see CONF-*). Refine bar present in footer.
  - **Priority:** Medium · **Regression impact:** Yes

- **WID-03 — Error shell with retry (retryable)**
  - **Feature/Module:** `WidgetShell` error mode, `canRetry`
  - **Scenario:** Negative.
  - **Steps:** 1) Cause a specialist to fail before any content rendered.
  - **Expected result:** Error shell shows `cloud_off`, error title + sanitized message (raw detail in tooltip), and a **Retry** button only when the error is retryable, not busy, and a stored brief exists.
  - **Priority:** High · **Regression impact:** Yes

- **WID-04 — Non-retryable error hides Retry**
  - **Feature/Module:** `canRetry`
  - **Scenario:** Edge.
  - **Steps:** 1) Trigger a non-retryable error (e.g., auth/validation class).
  - **Expected result:** Error shell shows the message but **no** Retry button.
  - **Priority:** Medium · **Regression impact:** Yes

- **WID-05 — Refine pulse animation on content change**
  - **Feature/Module:** `WidgetShell.firePulse` (generation bump)
  - **Scenario:** UI.
  - **Steps:** 1) Refine a rendered widget successfully.
  - **Expected result:** The widget briefly pulses (~700 ms) on the content update.
  - **Priority:** Low · **Regression impact:** Yes

- **WID-06 — Stale banner + Update button**
  - **Feature/Module:** `WidgetShell` stale banner, `rippleUpdate`
  - **Scenario:** Coordination (see RIP-*).
  - **Expected result:** A stale widget shows *"May be out of date. Upstream widget changed."* with an **Update** button (disabled while busy).
  - **Priority:** Medium · **Regression impact:** Yes

- **WID-07 — L7 regression: pulse timer cleared on destroy**
  - **Feature/Module:** `WidgetShell.destroyRef.onDestroy`
  - **Scenario:** Code-quality/edge.
  - **Steps:** 1) Refine a widget to start a pulse. 2) Immediately navigate away (unmount) mid-pulse.
  - **Expected result:** No console error/warning from a timer firing on a destroyed component (timer is cleared).
  - **Priority:** Low · **Regression impact:** No

---

### QA.10 — Confidence scoring badges (Feature 4)

- **CONF-01 — Tiered badge appears after audit**
  - **Feature/Module:** `WidgetShell` confidence pill, `setWidgetConfidence`
  - **Scenario:** Happy-path (new feature).
  - **Steps:** 1) Complete a run and let the auditor finish.
  - **Expected result:** Each audited widget shows a confidence pill `NN%` with a tier: **high ≥80%** (green, `verified`), **medium ≥60%** (amber, `insights`), **low <60%** (rose, `auto_fix_high`).
  - **Priority:** High · **Regression impact:** No

- **CONF-02 — Weakness tooltip**
  - **Feature/Module:** `confidenceTooltip`
  - **Scenario:** UI.
  - **Steps:** 1) Hover the confidence pill.
  - **Expected result:** Tooltip shows "Quality confidence: NN%" and, if present, a bulleted weakness list. `aria-label` announces the percentage.
  - **Priority:** Low · **Regression impact:** No

- **CONF-03 — Confidence pill hidden while an inline update error is shown**
  - **Feature/Module:** template `!hasInlineError() && confidenceTier()`
  - **Scenario:** Cross-state edge.
  - **Steps:** 1) Cause a refine on a rendered, previously-audited widget to fail (see ERR-01).
  - **Expected result:** The (now-stale) confidence pill is hidden while the "Update failed" state is shown.
  - **Priority:** Medium · **Regression impact:** No

---

### QA.11 — Self-healing & auto-repair toggle (M5)

- **HEAL-01 — Auto-repair toggle default on + persisted**
  - **Feature/Module:** `SettingsService.autoHeal`, `ControlTower` heal toggle
  - **Scenario:** Happy-path/persistence.
  - **Steps:** 1) Fresh state → observe the auto-repair (magic-wand) toggle in the Control Tower header. 2) Toggle off; reload. 3) Toggle on; reload.
  - **Expected result:** Default **on** (`aria-pressed=true`, `.on` styling). Tooltip: on → *"Auto-repair low-confidence widgets: On (uses extra Gemini calls)"*, off → *"…: Off"*. Setting persists across reload (`dea.autoHeal`).
  - **Priority:** High · **Regression impact:** No

- **HEAL-02 — Auto-repair triggers on low confidence + announces before→after (toggle on)**
  - **Feature/Module:** `maybeSelfHeal`, `announceHeals`
  - **Scenario:** Happy-path (new feature).
  - **Prerequisites:** Auto-repair ON; a run producing at least one widget scored **< 60%**.
  - **Steps:** 1) Submit a brief likely to yield a weak widget (e.g., sparse budget). 2) Watch after the first audit.
  - **Expected result:** The low-confidence widget shows a "Refining…" pulse, is re-generated (max **1** heal/widget/run), a single re-audit runs, and a toast announces e.g. *"Auto-repaired Budget agent 30% → 90%"* (or "Auto-repaired N widgets — …" for multiple).
  - **Priority:** High · **Regression impact:** No

- **HEAL-03 — Auto-repair suppressed when toggle off (cost consent)**
  - **Feature/Module:** `maybeSelfHeal` early return
  - **Scenario:** Negative/cost.
  - **Prerequisites:** Auto-repair **OFF**.
  - **Steps:** 1) Submit a brief that yields a low-confidence widget. 2) Compare token/API totals vs HEAL-02.
  - **Expected result:** **No** automatic repair generation or extra audit occurs; the low confidence badge simply remains; total API calls are fewer than with auto-repair on. No toast.
  - **Priority:** High · **Regression impact:** No

- **HEAL-04 — Heal cap (max 1 per widget per run)**
  - **Feature/Module:** `MAX_SELF_HEALS_PER_WIDGET`
  - **Scenario:** Boundary.
  - **Steps:** 1) With auto-repair on, run a brief where a widget stays low even after one repair.
  - **Expected result:** The widget is repaired at most **once** per run (no infinite repair loop / runaway spend).
  - **Priority:** Medium · **Regression impact:** No

---

### QA.12 — Refine (per-widget targeted edits) + M1

- **REF-01 — Refine a widget (happy path)**
  - **Feature/Module:** `RefineBar`, `AgentOrchestrator.refine`
  - **Scenario:** Happy-path.
  - **Prerequisites:** A completed run; not busy.
  - **Steps:** 1) Click Refine on Budget. 2) Type "cut A/V cost by 25%". 3) Apply.
  - **Expected result:** Only Budget re-runs and updates; other widgets untouched (except stale-marking, see RIP-01). Refine bar collapses.
  - **Priority:** High · **Regression impact:** Yes

- **REF-02 — Refine blocked while pipeline busy (single-flight, H2)**
  - **Feature/Module:** `refine` global busy guard + `RefineBar.inFlight`
  - **Scenario:** Concurrency/negative.
  - **Steps:** 1) Submit a brief. 2) While specialists/auditor still run, attempt to refine an already-rendered widget.
  - **Expected result:** The refine is **ignored** while busy (button disabled / early return); no in-flight work is aborted; no "Request cancelled" widgets appear.
  - **Priority:** Critical · **Regression impact:** Yes

- **REF-03 — Empty refine is a no-op**
  - **Feature/Module:** `refine` trim guard
  - **Scenario:** Edge.
  - **Steps:** 1) Open refine, submit empty.
  - **Expected result:** Nothing happens; no dispatch.
  - **Priority:** Low · **Regression impact:** Yes

- **REF-04 — M1 regression: successful refine clears stale confidence badge**
  - **Feature/Module:** `refine` → `clearWidgetConfidence`
  - **Scenario:** Regression (data-trust fix).
  - **Prerequisites:** A widget that has a confidence badge from a prior audit.
  - **Steps:** 1) Refine that widget successfully. 2) Observe its header.
  - **Expected result:** The confidence pill **disappears** after the refine (it no longer describes the new content) and reappears only after a re-audit. Previously it showed a stale score — verify it no longer does.
  - **Priority:** High · **Regression impact:** Yes

- **REF-05 — Refine keyboard + focus**
  - **Feature/Module:** `RefineBar` focus management
  - **Scenario:** UI/UX + a11y.
  - **Steps:** 1) Open Refine; verify the input gets focus. 2) Submit via Enter; Esc/collapse behavior.
  - **Expected result:** Input auto-focuses; Enter applies; the control behaves accessibly (no trap, page doesn't reload).
  - **Priority:** Low · **Regression impact:** Yes

---

### QA.13 — Cross-widget ripple updates

- **RIP-01 — Refine upstream marks downstream stale**
  - **Feature/Module:** `refine` → `markStale`, `directDependentsOf`
  - **Scenario:** Coordination (happy path).
  - **Steps:** 1) Refine Budget (reduce 30%). 2) Observe Schedule/Venue.
  - **Expected result:** Dependent widgets show the stale banner with an **Update** button.
  - **Priority:** High · **Regression impact:** Yes

- **RIP-02 — Manual ripple update refreshes the stale widget + re-audits**
  - **Feature/Module:** `rippleUpdate`
  - **Scenario:** Happy-path.
  - **Steps:** 1) After RIP-01, click **Update** on a stale widget.
  - **Expected result:** That widget re-runs against current upstream payloads, stale banner clears, then the auditor re-runs. Blocked if busy.
  - **Priority:** High · **Regression impact:** Yes

- **RIP-03 — Ripple with no upstream present clears stale gracefully**
  - **Feature/Module:** `rippleUpdate` no-ups branch
  - **Scenario:** Edge.
  - **Steps:** 1) Contrive a stale downstream whose upstream widget doesn't exist. 2) Click Update.
  - **Expected result:** Stale flag is simply cleared (no dispatch, no error).
  - **Priority:** Low · **Regression impact:** Yes

---

### QA.14 — Audit ribbon: states, fix-its, re-audit (M3, M7)

- **AUD-01 — Clean audit state**
  - **Feature/Module:** `AuditRibbon` isClean
  - **Scenario:** Happy-path.
  - **Expected result:** When the auditor finishes with no issues, ribbon shows a verified/clean message (auditor summary or "Looks consistent. No cross-widget issues found.") with a **Re-audit** button.
  - **Priority:** Medium · **Regression impact:** Yes

- **AUD-02 — Issues list + Apply fix**
  - **Feature/Module:** `AuditRibbon`, `applyFixIt`
  - **Scenario:** Happy-path (fix-it).
  - **Prerequisites:** A run that yields ≥1 audit issue (e.g., the Mumbai summit prompt).
  - **Steps:** 1) Read the issue list. 2) Click **Apply fix** on one issue.
  - **Expected result:** The target widget re-runs with the issue's auto-brief, downstreams ripple as needed, then a re-audit runs. The applied issue is resolved/updated.
  - **Priority:** High · **Regression impact:** Yes

- **AUD-03 — Dismiss an issue**
  - **Feature/Module:** `dismissAuditIssue`
  - **Scenario:** UI.
  - **Steps:** 1) Click the dismiss (x) on an issue.
  - **Expected result:** That issue is removed from the list (keyed by id); others remain.
  - **Priority:** Low · **Regression impact:** Yes

- **AUD-04 — Apply/re-audit gated while busy (H2)**
  - **Feature/Module:** `canApply`, `reAudit` busy guard
  - **Scenario:** Concurrency/negative.
  - **Steps:** 1) Start a run. 2) While busy, attempt Apply fix / Re-audit.
  - **Expected result:** Buttons disabled / early-return; no aborting of in-flight work.
  - **Priority:** High · **Regression impact:** Yes

- **AUD-05 — Awaiting-audit + Run critic states**
  - **Feature/Module:** `awaitingAudit`, `specialistsRunning` states
  - **Scenario:** State coverage.
  - **Steps:** 1) Observe ribbon while specialists run (→ "Critic standing by…"). 2) If audit is idle with content and specialists done (→ "Specialists done. Run the critic…") click **Run critic**.
  - **Expected result:** Correct standby/awaiting copy; "Run critic" triggers an audit.
  - **Priority:** Medium · **Regression impact:** Yes

- **AUD-06 — M3 regression: concurrent re-audit is not dropped**
  - **Feature/Module:** `audit` finally re-run against current controller
  - **Scenario:** Regression (concurrency fix).
  - **Prerequisites:** Ability to click **Re-audit** (or Apply fix) while an audit is already in flight.
  - **Steps:** 1) Trigger an audit. 2) Before it finishes, click **Re-audit** again.
  - **Expected result:** The queued re-audit **runs** after the first completes (re-reads the current controller signal) and the ribbon reflects fresh results — it is not silently skipped. (Cross-check unit spec for M3.)
  - **Priority:** High · **Regression impact:** Yes

- **AUD-07 — M7 regression: duplicate issue ids don't crash the ribbon**
  - **Feature/Module:** `AgentStore.setAuditResult` → `dedupeIssueIds`
  - **Scenario:** Regression (crash fix).
  - **Prerequisites:** A model response (or seam/mock) with two issues sharing an id and/or blank ids.
  - **Steps:** 1) Produce an audit payload with duplicate/blank issue ids.
  - **Expected result:** The ribbon renders all issues without an NG0955 "duplicated keys" error (ids are de-duplicated/back-filled); dismiss still works per-issue. (Cross-check specs "deduplicates model-generated ids" / "backfills a stable id".)
  - **Priority:** High · **Regression impact:** Yes

- **AUD-08 — Auditor error state + retry**
  - **Feature/Module:** `AuditRibbon` isAuditorErrored
  - **Scenario:** Negative.
  - **Steps:** 1) Force the auditor to fail. 2) Click **Retry** in the ribbon.
  - **Expected result:** Ribbon shows the sanitized auditor error with a Retry; retry re-runs the audit. Auditor failure is non-fatal (widgets remain).
  - **Priority:** Medium · **Regression impact:** Yes

---

### QA.15 — Concurrency / single-flight / abort handling (H2)

- **CONC-01 — Cancellations never render as widget errors (H2 core)**
  - **Feature/Module:** `agent-base` abort → idle
  - **Scenario:** Regression (critical).
  - **Steps:** 1) Start a run. 2) Immediately submit a *new* brief (which aborts the first via `freshSignal`).
  - **Expected result:** The first run's aborted agents reset to **idle** and do not appear as "Request cancelled"/"Failed" shells. The new run proceeds cleanly. No spurious error toasts.
  - **Priority:** Critical · **Regression impact:** Yes

- **CONC-02 — Key clear during run aborts cleanly**
  - **Feature/Module:** orchestrator key-change effect + abort→idle
  - **Scenario:** Regression.
  - **Steps:** 1) Start a run. 2) Clear the key mid-run.
  - **Expected result:** In-flight work aborts, resets to idle, workspace returns to no-key state; no error widgets or stuck busy.
  - **Priority:** High · **Regression impact:** Yes

- **CONC-03 — Rapid double submit**
  - **Feature/Module:** `freshSignal`, single-flight
  - **Scenario:** Edge/stress.
  - **Steps:** 1) Submit; within ~1s submit again with different text.
  - **Expected result:** Only the latest run's results render; the earlier is cleanly superseded (no leftover ghost/error shells from the aborted run).
  - **Priority:** High · **Regression impact:** Yes

---

### QA.16 — Inline update error + retry on a rendered widget (M2)

- **ERR-01 — Failed refine on a rendered widget shows inline "Update failed"**
  - **Feature/Module:** `WidgetShell.hasInlineError`
  - **Scenario:** Regression (data-trust fix).
  - **Prerequisites:** A rendered widget; force its refine to fail (throttle/transient).
  - **Steps:** 1) Refine the widget so the dispatch errors.
  - **Expected result:** The widget **keeps its previous content**, the header pill flips from "Done" to **"Update failed"**, and an inline banner appears: *"Update failed — showing the previous version."* with the sanitized message (raw detail in tooltip). Confidence pill hidden. Previously this failed silently with a stale "Done" — verify it no longer does.
  - **Priority:** High · **Regression impact:** Yes

- **ERR-02 — Inline Retry recovers (retryable)**
  - **Feature/Module:** `WidgetShell.retry` inline button
  - **Scenario:** Negative recovery.
  - **Prerequisites:** ERR-01 state; error is retryable; not busy.
  - **Steps:** 1) Click the inline **Retry**.
  - **Expected result:** The widget re-dispatches its stored brief; on success it returns to Done with fresh content; the inline error clears.
  - **Priority:** High · **Regression impact:** No

- **ERR-03 — Retry hidden while busy / non-retryable**
  - **Feature/Module:** `canRetry`
  - **Scenario:** Edge.
  - **Steps:** 1) Produce an inline error while another run is busy, and separately with a non-retryable error.
  - **Expected result:** Inline Retry is hidden/disabled when busy or when the error isn't retryable.
  - **Priority:** Medium · **Regression impact:** No

---

### QA.17 — Planner retry re-dispatch (M8)

- **RETRY-01 — Specialist retry uses stored brief**
  - **Feature/Module:** `retryAgent(specialist)`
  - **Scenario:** Recovery. (See CT-04.)
  - **Expected result:** Re-dispatches just that specialist; widget updates.
  - **Priority:** Medium · **Regression impact:** Yes

- **RETRY-02 — M8 regression: planner retry re-runs specialists + re-audits**
  - **Feature/Module:** `retryAgent('planner')`
  - **Scenario:** Regression (fix).
  - **Prerequisites:** A completed run; planner row retryable (errored) or use the Control Tower planner Retry.
  - **Steps:** 1) Retry the planner.
  - **Expected result:** After the re-plan, the **specialists are re-dispatched** on the new briefs and a **re-audit** runs — the widgets track the new plan (they don't silently diverge). Previously retry only regenerated the rationale — verify specialists now update.
  - **Priority:** High · **Regression impact:** Yes

---

### QA.18 — Currency formatting (L6)

- **CUR-01 — Valid ISO currency renders correctly**
  - **Feature/Module:** `safeCurrencyCode`, budget/venue widgets
  - **Scenario:** Happy-path.
  - **Steps:** 1) Run a brief specifying INR (₹) or USD.
  - **Expected result:** Budget totals/line items and venue estimated cost render with the correct narrow symbol and no decimals (`1.0-0`).
  - **Priority:** Medium · **Regression impact:** Yes

- **CUR-02 — Invalid/empty currency falls back to USD (no crash)**
  - **Feature/Module:** `safeCurrencyCode` fallback
  - **Scenario:** Edge (regression fix).
  - **Prerequisites:** A model response with a bad currency code (e.g., "Rs", "rupees", ""). Use a brief phrased to induce it, or a seam/mock.
  - **Steps:** 1) Render a budget/venue widget with a non-ISO currency string.
  - **Expected result:** Amounts render safely (fallback USD, uppercased valid codes) — **no** `CurrencyPipe` invalid-argument error and no broken widget.
  - **Priority:** Medium · **Regression impact:** Yes

---

### QA.19 — Theme & CSP / security (M6)

- **THEME-01 — Toggle light/dark + persist + no FOUC**
  - **Feature/Module:** `ThemeService`, `public/theme-init.js`
  - **Scenario:** Happy-path/persistence.
  - **Steps:** 1) Toggle theme in the top bar. 2) Reload. 3) Clear `dea.theme` and reload to test system-preference default.
  - **Expected result:** Theme switches immediately and persists (`dea.theme`). On reload there is **no flash** of the wrong theme (self-hosted `theme-init.js` applies the class pre-paint). With no stored theme, it follows `prefers-color-scheme`.
  - **Priority:** Medium · **Regression impact:** Yes

- **SEC-01 — CSP has no `script-src 'unsafe-inline'` (M6)**
  - **Feature/Module:** `src/index.html` CSP, build output
  - **Scenario:** Security regression (critical fix).
  - **Steps:** 1) In the running app, view page source / DevTools → the CSP `<meta>`. 2) In a production build (`dist/.../index.html`), inspect the CSP and search for inline `<script>`/inline `on*=` handlers.
  - **Expected result:** `script-src 'self'` only (no `'unsafe-inline'`). No inline `<script>` and no inline event handlers in the built HTML. `style-src 'unsafe-inline'` is intentionally retained (Material). `connect-src` limited to `'self'` + `generativelanguage.googleapis.com`; `object-src 'none'`; `frame-ancestors 'none'`.
  - **Priority:** High · **Regression impact:** Yes

- **SEC-02 — No CSP violations in console during normal use**
  - **Feature/Module:** runtime CSP
  - **Scenario:** Regression.
  - **Steps:** 1) Exercise home, key dialog, a full run, theme toggle, fonts/icons.
  - **Expected result:** No CSP violation errors in the console; fonts/icons/styles load; Gemini calls succeed.
  - **Priority:** High · **Regression impact:** Yes

- **SEC-03 — Outbound calls limited to the Gemini host**
  - **Feature/Module:** network posture
  - **Scenario:** Security.
  - **Steps:** 1) With DevTools Network open, run a brief + validate a key.
  - **Expected result:** External API traffic goes only to `generativelanguage.googleapis.com` (plus static assets/fonts); no telemetry/proxy calls elsewhere.
  - **Priority:** High · **Regression impact:** Yes

- **SEC-04 — Rendered content is XSS-safe**
  - **Feature/Module:** renderer / widgets
  - **Scenario:** Security edge.
  - **Steps:** 1) Craft a brief so model output includes HTML/script-like strings (e.g., "name the venue `<img src=x onerror=alert(1)>`").
  - **Expected result:** Content is rendered as text (Angular interpolation/sanitization); no script executes; external links carry `rel="noopener noreferrer"`.
  - **Priority:** High · **Regression impact:** Yes

- **SEC-05 — Known: plaintext key + last-4 on screen (M9, open)**
  - **Feature/Module:** `ApiKeyService` storage, top bar chip
  - **Scenario:** Security (documented trade-off).
  - **Steps:** 1) Connect a key; inspect `localStorage` and the top bar.
  - **Expected result (current):** Key is stored plaintext in `dea.geminiApiKey`; top bar shows `••••<last4>`. This is a **known, accepted BYOK trade-off (M9)** — record it; not a release blocker per the plan.
  - **Priority:** Low · **Regression impact:** No

---

### QA.20 — Dependency Injection / `@Service()` migration & app bootstrap

- **DI-01 — App boots with no DI errors after `@Service()` migration**
  - **Feature/Module:** all root singletons migrated to `@Service()`
  - **Scenario:** Regression (framework migration).
  - **Steps:** 1) Cold-load the app. 2) Exercise features that touch each migrated service (store, orchestrator, agents, api-key, settings, theme, intake, notifications, prompt-draft, api-key-dialog).
  - **Expected result:** No "NullInjector"/"No provider" errors; all singletons resolve; global error handler still works (it remains token-provided `@Injectable`). A single instance of each service is shared (e.g., theme/settings state consistent across components).
  - **Priority:** Critical · **Regression impact:** Yes

- **DI-02 — Global error handler still catches unhandled errors**
  - **Feature/Module:** `global-error-handler.ts`
  - **Scenario:** Regression.
  - **Steps:** 1) Trigger an unexpected runtime error path (if reachable).
  - **Expected result:** Errors are handled/toasted via the global handler without duplicate toasts for already-handled `AppError`s.
  - **Priority:** Medium · **Regression impact:** Yes

---

### QA.21 — Empty / loading / error state coverage (cross-feature)

- **STATE-01 — No-key empty state (workspace)** — see ONB-01. **Priority:** High · **Regression:** Yes
- **STATE-02 — Key present, no content:** dashboard shows "Your dashboard appears here" empty panel with the five-agent explainer. **Priority:** Medium · **Regression:** Yes
- **STATE-03 — Command Center busy banner** copy switches "Planner is decomposing your brief…" → "Specialists are streaming results in parallel…" with an indeterminate progress bar. **Priority:** Low · **Regression:** Yes
- **STATE-04 — Ghost/shimmer widget loading** — see WID-01. **Priority:** Medium · **Regression:** Yes
- **STATE-05 — Intake "Reading <file>…" loading** — see FILE-01. **Priority:** Medium · **Regression:** No
- **STATE-06 — Key validation "Validating…" loading** — see ONB-03. **Priority:** Medium · **Regression:** Yes
- **STATE-07 — Audit ribbon default/standby copy** when no audit yet ("Critic agent: cross-checks budget, schedule, and venue after each run."). **Priority:** Low · **Regression:** Yes
- **STATE-08 — Offline behavior (L1, open):**
  - **Feature/Module:** app-wide network handling.
  - **Scenario:** Negative/reliability (known gap).
  - **Steps:** 1) Go **Offline** (DevTools). 2) Submit a brief.
  - **Expected result (current):** Agents fail into a generic `network` error toast/error shells only after the request fails; there is **no** proactive offline banner and Submit is not pre-disabled — this is a **known open item (L1)**. Verify failures are graceful (no crash/stuck busy), then log the UX gap.
  - **Priority:** Medium · **Regression impact:** No

---

### QA.22 — UI/UX & design consistency

- **UX-01 — Responsive layout (desktop/tablet/mobile)**
  - **Scenario:** UI/UX. Resize to ~1440px, ~768px, ~375px across home + workspace.
  - **Expected result:** Layout grids reflow (Command Center / Control Tower / dashboard) without overlap, clipping, or horizontal scroll; buttons/chips wrap sensibly.
  - **Priority:** Medium · **Regression impact:** Yes

- **UX-02 — Theming consistency in both modes**
  - **Scenario:** Design. Toggle dark/light and scan all surfaces (home, dialog, widgets, tower, ribbon, banners, tooltips).
  - **Expected result:** Colors/contrast/typography consistent with the design tokens; no unstyled/mismatched elements; confidence tiers (green/amber/rose) legible in both themes.
  - **Priority:** Medium · **Regression impact:** Yes

- **UX-03 — Tooltip/label consistency**
  - **Scenario:** UI. Hover key chip, theme toggle, heal toggle, confidence pill, telemetry chips, refine/apply/retry buttons.
  - **Expected result:** Tooltips present, accurate, and positioned; button labels/icons match their action.
  - **Priority:** Low · **Regression impact:** Yes

- **UX-04 — Focus & keyboard flow**
  - **Scenario:** UI/UX + a11y. Tab through key dialog, command center, refine bar.
  - **Expected result:** Logical focus order; dialog focus-traps; refine input auto-focuses; visible focus rings.
  - **Priority:** Medium · **Regression impact:** Yes

---

### QA.23 — Accessibility (present behavior + known gaps)

- **A11Y-01 — aria-live status regions announce progress**
  - **Scenario:** A11y. With a screen reader, run a brief.
  - **Expected result:** Busy banner, intake "Reading…", and audit "reviewing…" are announced via `role="status"`/`aria-live`.
  - **Priority:** Medium · **Regression impact:** Yes

- **A11Y-02 — Interactive controls have accessible names**
  - **Scenario:** A11y. Inspect key chip, theme toggle (`aria-label`), heal toggle (`aria-pressed`), dismiss, retry.
  - **Expected result:** All have meaningful names/roles/states.
  - **Priority:** Medium · **Regression impact:** Yes

- **A11Y-03 — Known gaps (L4, open): landmarks + tooltip-only weaknesses**
  - **Scenario:** A11y (known open).
  - **Steps:** 1) Check for a `<main>` landmark / skip link. 2) Try to reach the confidence weaknesses via keyboard/AT.
  - **Expected result (current):** No `<main>`/skip-link, and the confidence weakness list lives only in a hover tooltip (the `aria-label` announces only the percentage) — **known open item (L4)**. Log; not a blocker per the plan.
  - **Priority:** Low · **Regression impact:** No

---

### QA.24 — Performance & loading

- **PERF-01 — Lazy loading of SDK/dialog/widgets**
  - **Scenario:** Performance. With Network open, load home, then connect a key, then run.
  - **Expected result:** The `@google/genai` SDK and dialog/widget chunks load on demand (not in the initial bundle); initial load stays lean. No blocking on the SDK before it's needed.
  - **Priority:** Medium · **Regression impact:** Yes

- **PERF-02 — No runaway re-renders / timers**
  - **Scenario:** Performance. Run several briefs + refines; watch CPU and console.
  - **Expected result:** No console spam, no perpetual intervals after runs settle (ticker stops when idle/hidden), pulse timers cleared (WID-07). Memory doesn't grow unbounded across repeated runs.
  - **Priority:** Medium · **Regression impact:** Yes

- **PERF-03 — Production build budgets**
  - **Scenario:** Performance/process. Run `npm run build`.
  - **Expected result:** Build succeeds; only the known/acceptable budget **warning** (if any), no errors; initial bundle within expected range (~128 kB gzip per prior review).
  - **Priority:** Low · **Regression impact:** Yes

---

### QA.25 — Cross-feature interaction

- **CROSS-01 — Intake (file) → run → audit → confidence → self-heal**
  - **Scenario:** Cross-feature end-to-end.
  - **Steps:** 1) Attach a brief image (FILE-01). 2) Run. 3) Let audit + auto-heal (on) complete.
  - **Expected result:** Interpreted brief drives a full run; confidence badges appear; a low-confidence widget auto-repairs with a toast; dashboard consistent.
  - **Priority:** High · **Regression impact:** Yes

- **CROSS-02 — Voice → edit → run → refine → ripple → apply-fix**
  - **Scenario:** Cross-feature end-to-end.
  - **Steps:** 1) Dictate a brief, edit it, run. 2) Refine Budget. 3) Update a stale downstream. 4) Apply an audit fix.
  - **Expected result:** Each step behaves per its section; single-flight prevents overlaps; no cancelled-widget artifacts; final dashboard coherent.
  - **Priority:** High · **Regression impact:** Yes

- **CROSS-03 — Quality mode + self-heal cost visibility**
  - **Scenario:** Cross-feature (cost).
  - **Steps:** 1) Switch to Quality (Pro key). 2) Run a brief that triggers auto-heal. 3) Read telemetry.
  - **Expected result:** Quality model ids used; self-heal spend reflected in token/cost totals; heal toast shown; toggling auto-heal off reduces spend.
  - **Priority:** Medium · **Regression impact:** No

- **CROSS-04 — Theme toggle mid-run**
  - **Scenario:** Cross-feature edge.
  - **Steps:** 1) Start a run. 2) Toggle theme while streaming.
  - **Expected result:** Theme switches instantly with no disruption to the in-flight run or widget states.
  - **Priority:** Low · **Regression impact:** Yes

---

### QA.26 — Build / lint / test process gates (L2, L3)

- **PROC-01 — Node engine guardrail**
  - **Scenario:** Process. On Node < 22.22.3, run `npm start`/`npm test`.
  - **Expected result:** A clear engine/CLI failure (and `engines` pin present); on `nvm use` (22.22.3 from `.nvmrc`) commands work.
  - **Priority:** Low · **Regression impact:** No

- **PROC-02 — Lint clean**
  - **Scenario:** Process. Run `npm run lint`.
  - **Expected result:** angular-eslint runs and reports **no errors**.
  - **Priority:** Low · **Regression impact:** No

- **PROC-03 — Unit tests green**
  - **Scenario:** Process. Run `npm test`.
  - **Expected result:** All specs pass (**142 expected**), including the new intake/settings/currency/self-heal/dedupe/abort specs.
  - **Priority:** High · **Regression impact:** Yes

---

### QA.27 — Regression sweep (existing functionality that must still work)

- **REG-01 — Navigation:** `/` ↔ `/architect` links, top-bar brand/Architect link, `routerLinkActive` highlighting. **Priority:** Medium · **Regression:** Yes
- **REG-02 — Citations:** widgets with grounded results show citation chips with safe external links (`rel="noopener noreferrer"`). **Priority:** Medium · **Regression:** Yes
- **REG-03 — Refine/ripple/audit end-to-end** still function exactly as before the branch (covered by REF-*, RIP-*, AUD-*); confirm no behavior regressions from the Signal Forms/`@Service()` migrations. **Priority:** High · **Regression:** Yes
- **REG-04 — Telemetry accuracy:** per-agent + total token/cost/duration accumulate correctly across run + refine + heal. **Priority:** Low · **Regression:** Yes
- **REG-05 — Notifications:** all error paths route through friendly toasts (no raw API/JSON strings surfaced to users); `MissingApiKeyError` always yields "Please connect a Gemini API key first." **Priority:** High · **Regression:** Yes
- **REG-06 — Reload persistence:** key, mode, theme, and auto-heal survive reload; in-memory run state resets. **Priority:** Medium · **Regression:** Yes
