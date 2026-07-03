# Maestro — AI Feature Proposals

> A planning document proposing five high-impact, AI-focused features to evolve Maestro from a conference demo into a production-shaped multi-agent application.

## Context & guiding principles

Maestro today is a **client-only Angular 22 SPA** (zoneless, signals) that turns one natural-language brief into a live dashboard via a five-agent Gemini pipeline (Planner → Budget / Schedule / Venue → Auditor), coordinated by `AgentOrchestrator` over a signal-based `AgentStore`. It is **BYOK** (the key lives only in `localStorage` and talks straight to `generativelanguage.googleapis.com`), has a **strict CSP**, and ships **no backend and no telemetry**.

Every proposal below is designed to **respect those constraints** rather than fight them:

- **No new backend required** — features run client-side against the user's own Gemini key (the `@google/genai` SDK already supports files, embeddings, and function calling in-browser).
- **Reuse the existing contracts** — `AgentStore` stays the single source of truth; `AgentOrchestrator` stays the only mutation surface; agents keep extending `AgentBase.runStreamed()`; errors keep flowing through `toAppError()`.
- **Preserve privacy & security** — anything new keeps `connect-src` limited to the Gemini host, keeps the key out of logs, and stays opt-in.

Each feature demonstrates a pattern that is common in real production AI systems: **agentic tool-use**, **RAG**, **multimodal intake**, **evaluation / self-correction**, and **cost governance / model routing**.

---

## Roadmap status

_Decision date: **2026-07-03**._ After review, two features were committed for the next milestone and three deferred. Both committed features (plus the reliability prerequisite) **shipped on 2026-07-03**. Status legend: ✅ **Implemented** · 🟢 **Planned** · ⏸️ **Deferred**.

| # | Feature | Status | Complexity | Headline impact |
|---|---------|--------|------------|-----------------|
| 3 | **Multimodal Brief Intake** | ✅ Implemented — 2026-07-03 | Medium | Speak or drop a screenshot; the demo "wow" moment |
| 4 | **Confidence Scoring & Self-Healing Widgets** | ✅ Implemented — 2026-07-03 | Medium | Users trust outputs; bad results fix themselves |
| 1 | **Conversational Orchestration** ("Maestro Chat") | ⏸️ Deferred | Medium–High | Talk to the whole plan instead of editing widgets one by one |
| 2 | **Bring-Your-Own-Context (RAG)** | ⏸️ Deferred | Medium–High | Plans grounded in *your* data, not just the model's guess |
| 5 | **Intelligent Model Routing & Cost Governance** | ⏸️ Deferred | Medium | Lower cost & latency at scale; visible savings |

**Why these two first:** Multimodal Intake (3) is the highest demo-impact-per-effort feature with a small architectural blast radius (it only widens the intake input), and Confidence Scoring & Self-Healing (4) deepens the repo's core multi-agent thesis with the reliability/eval narrative technical audiences care about. Both are Medium complexity, need no backend or CSP changes, and are stage-reliable. Both landed in the 2026-07-03 milestone alongside the `globalStatus` reliability fix.

**Why the rest are deferred:** Conversational Orchestration (1) is Medium–High with a non-deterministic tool loop that is risky on a live stage — a strong phase-2 candidate. RAG (2) is the heaviest of the five with the lowest demo-drama-per-effort; if/when it lands it should start as lightweight context-stuffing / Gemini File API (not a full vector pipeline) and pair with Feature 5 to amortize embedding infrastructure. Cost Governance (5) is a valuable production/scalability play but mostly invisible on stage.

**Reference — full production-pattern coverage** (name · pattern · AI capability):

| # | Feature | Production pattern | AI capability |
|---|---------|--------------------|---------------|
| 1 | **Conversational Orchestration** | Agent-as-controller / function calling | Multi-turn tool-use over the live dashboard |
| 2 | **Bring-Your-Own-Context (RAG)** | Retrieval-augmented generation | Grounding on user documents + embeddings retrieval |
| 3 | **Multimodal Brief Intake** | Multimodal input pipeline | Voice + image + document → structured brief |
| 4 | **Confidence Scoring & Self-Healing Widgets** | LLM-as-judge + guardrails + auto-repair | Structured evaluation and bounded self-correction |
| 5 | **Intelligent Model Routing & Cost Governance** | Model cascade + semantic caching + budgets | Complexity-aware routing, cached generations |

**Build sequence:** shipped ✅ **4 → 3** (reliability foundation, then the visible intake upgrade); next revisit the deferred set in order **5 → 2 → 1** as the project matures.

---

## Feature 1 — Conversational Orchestration ("Maestro Chat")

> **Status: ⏸️ Deferred.** Strong phase-2 candidate; deferred for the next milestone because the Medium–High build and its non-deterministic tool loop are the riskiest to run live on stage.

**Feature name:** Conversational Orchestration — a session-wide chat that drives the dashboard through Gemini function calling.

**Problem it solves.** Today every action is a discrete UI gesture: submit a brief, open a widget's refine bar, click a fix-it, click "Update" on a stale widget. Cross-cutting intents like *"make the whole thing 20% cheaper and shift everything a week later"* require several manual steps and can't span widgets. There is also no conversational memory — each refine is a one-shot delta against a single widget's prior JSON (`buildRefinePrompt`).

**Why it adds production value.** The "agent that controls the app via tools" pattern (function calling / tool-use) is the dominant interaction model in modern AI products (Copilot-style assistants, ChatGPT tool use). It turns Maestro from a form-driven generator into an **agentic assistant**, which is both a stronger product story and a far more compelling live demo — the presenter narrates intent and the dashboard reorganizes itself.

**How AI is used.** A new `ConversationAgent` runs a Gemini chat session with **function declarations** that map 1:1 onto existing orchestrator capabilities. The model reads the current dashboard snapshot + conversation history, then decides which tool(s) to call:

```ts
// Proposed: tool schema mirrors AgentOrchestrator's public surface
const TOOLS: FunctionDeclaration[] = [
  { name: 'run_full_plan',   parameters: { brief: 'string' } },
  { name: 'refine_widget',   parameters: { widgetId: 'budget|schedule|venue', instruction: 'string' } },
  { name: 'apply_all_fixes', parameters: {} },
  { name: 'ripple_update',   parameters: { widgetId: 'budget|schedule|venue' } },
  { name: 're_audit',        parameters: {} },
];
```

The agent loop: send user turn + tool results back until the model stops requesting calls, then summarize what changed. Multi-widget intents fan out into several `refine_widget` calls that the orchestrator already knows how to sequence (and ripple).

**High-level implementation approach.**
- Add `core/ai/agents/conversation.agent.ts` extending `AgentBase`; use `client.chats.create()` with `tools` + `automaticFunctionCalling` (or a manual tool loop for tighter control over `AbortSignal`).
- Add a lightweight `core/state/conversation.store.ts` (signal list of turns) — keep `AgentStore` as the dashboard source of truth; the chat store only holds transcript + pending-tool state.
- Bridge tool calls to the existing `AgentOrchestrator` methods (`run`, `refine`, `applyFixIt`, `rippleUpdate`, `reAudit`) — **no orchestration logic is duplicated**, tools are thin adapters.
- Provide the model context via `store.snapshotForAudit()` + `plannerRationale()` + open `auditIssues()` each turn.
- Add a chat surface to `CommandCenter` (toggle between "Brief" and "Chat" modes); reuse the busy/streaming signals already exposed by the store.
- Preserve the `freshSignal()` / `AbortController` discipline so a new turn or key change cancels in-flight tool runs.

**Estimated implementation complexity:** Medium–High (tool loop + streaming + cancellation are the risk areas; the orchestrator surface it wraps already exists).

**Expected user impact.** High. Converts multi-step, multi-widget edits into a single sentence, gives the app a memory of the session, and produces the strongest "this is an AI agent, not a form" narrative for a conference stage.

---

## Feature 2 — Bring-Your-Own-Context (Client-Side RAG)

> **Status: ⏸️ Deferred.** Highest-effort, lowest demo-drama of the five. When revisited, start with lightweight context-stuffing / Gemini File API (skip the vector pipeline) and pair with Feature 5 to share embedding infrastructure.

**Feature name:** Bring-Your-Own-Context — ground the agents in user-supplied documents (past budgets, sponsor lists, venue shortlists, brand guidelines).

**Problem it solves.** Specialists currently plan from the brief plus (for Schedule/Venue) live Google Search. They have **no access to the user's own reality**: last year's actuals, an approved vendor list, a fixed venue, or brand tone. Outputs are plausible but generic, and a real planner must reconcile them by hand.

**Why it adds production value.** Retrieval-Augmented Generation is *the* defining production pattern for making LLMs useful on private/organizational data. Adding RAG moves Maestro from "impressive generator" to "useful assistant grounded in my documents," which is exactly the leap that separates demos from products — and it composes naturally with the app's existing citation UI.

**How AI is used.**
- **Ingestion:** documents are chunked and embedded via the Gemini embeddings endpoint (`ai.models.embedContent`, model id resolved against the user's key), stored **in-memory / IndexedDB** on the client.
- **Retrieval:** at plan/refine time, the relevant per-specialist brief is embedded and the top-k chunks are selected by cosine similarity, then injected as a `## Grounding context` block into that agent's `contents`.
- Small documents can skip retrieval and be inlined directly (or uploaded via the Gemini File API and referenced by handle) — a pragmatic fallback for an OSS app.

**High-level implementation approach.**
- Add `core/ai/knowledge/knowledge.service.ts`: `ingest(file)`, `retrieve(query, k)`, `clear()`; a tiny cosine-similarity search over an in-memory `Float32Array` index (no vector DB needed at demo scale).
- Extend agent `contents` assembly (in `SpecialistAgentBase.run` / `buildRefinePrompt`) to optionally prepend retrieved chunks; gate behind a `hasKnowledge()` signal so behavior is unchanged when no docs are loaded.
- Extend the `Citation` type with `source: 'search' | 'document'` and reuse `CitationChips` to show **document provenance** next to search citations — so grounding stays visible and trustworthy.
- Add an "Add context" affordance to `CommandCenter` / `WorkspacePage` (drag-drop + file list with remove).
- Keep CSP intact (embeddings/file calls hit the same Gemini host already whitelisted in `connect-src`).

**Estimated implementation complexity:** Medium–High (chunking + embeddings + retrieval + persistence; the retrieval math itself is small, ingestion UX and token-budgeting are the work).

**Expected user impact.** High for real users (plans reflect their constraints and history); strong demo value (upload a one-page sponsor brief, re-run, and watch the budget/venue adapt with document-sourced citations).

---

## Feature 3 — Multimodal Brief Intake

> **Status: ✅ Implemented — 2026-07-03.** Shipped as a dedicated `IntakeService` (`core/ai/intake/`) plus voice ("Speak") and "Attach image / PDF" controls in the Command Center, with a confirm-before-run step (the interpreted brief lands in the prompt box for editing). Scope note vs. the original proposal: intake produces an **editable text brief** that flows through the unchanged `run(text)` pipeline rather than sending `Part[]` straight to the Planner — this keeps the architectural blast radius tiny and preserves demo determinism. Voice uses the Web Speech API (opt-in); images/PDFs are read in-browser and inlined to the user's own Gemini key. No CSP change.

**Feature name:** Multimodal Brief Intake — start a plan from **voice**, an **image** (napkin sketch, existing agenda screenshot, floor plan), or a **spreadsheet/PDF**, not just typed text.

**Problem it solves.** The only way to start a plan is to type (or click a sample chip). Real briefs arrive as a voice note, a photo of a whiteboard, a forwarded PDF, or a rough spreadsheet. Forcing everything through a textarea is friction and hides Gemini's strongest differentiator.

**Why it adds production value.** Multimodal intake is increasingly table-stakes in production assistants and is one of Gemini's headline capabilities. It broadens real-world usefulness (accessibility, mobile capture, "just show it the thing") and is the single most reliable **audience wow-moment** at a conference — speak a brief or drop a photo and watch the pipeline fire.

**How AI is used.**
- `contents` sent to the Planner becomes a **`Part[]`** (text + `inlineData` for images/PDF + audio), letting Gemini natively read the artifact and produce the same `PlannerOutput` routing JSON it produces today.
- **Voice:** either the Web Speech API for on-device transcription, or send audio bytes to Gemini directly for transcription + intent extraction.
- The Planner's existing job (decompose into per-specialist briefs) is unchanged — only its **input modality** expands, so downstream agents and schemas need no changes.

**High-level implementation approach.**
- Generalize `AgentBase.runStreamed`'s `contents: string` to accept `string | Part[]`; the Planner path builds the multimodal `Part[]`.
- Add a mic button + file/image dropzone to `CommandCenter`; show a "transcribing / reading your file…" state reusing store busy signals.
- For voice, prefer Web Speech API where available (zero token cost, no CSP change) and fall back to Gemini audio.
- Add a confirmation step: show the model's **interpreted text brief** in the textarea before running, so users can correct misreads (important for trust and for demo determinism).
- Keep everything within the existing CSP; large files can route through the Gemini File API.

**Estimated implementation complexity:** Medium (the model support is native; browser media capture, file-size limits, and a clean confirm-before-run UX are the real work).

**Expected user impact.** High perceived value and accessibility; medium day-to-day utility. Best-in-class demo appeal — this is the feature audiences will film.

---

## Feature 4 — Confidence Scoring & Self-Healing Widgets

> **Status: ✅ Implemented — 2026-07-03.** Shipped: the Auditor now returns a per-widget `confidence` (0–1) + `weaknesses[]` via an extended `AUDITOR_SCHEMA`; `AgentStore` holds `widgetConfidence`; `AgentOrchestrator.maybeSelfHeal()` re-runs any widget scoring below `CONFIDENCE_THRESHOLD` (0.6), capped at `MAX_SELF_HEALS_PER_WIDGET` (1) per run and followed by a single re-audit; `WidgetShell` shows a tiered confidence badge (green/amber/rose) with a weakness tooltip. Covered by store, prompt, and orchestrator specs.

**Feature name:** Confidence Scoring & Self-Healing — every widget carries a graded quality/confidence signal, and low-confidence outputs repair themselves within bounded retries.

**Problem it solves.** The Auditor already finds *cross-widget* inconsistencies, but there is **no per-widget quality signal** and **no automatic correction** — a thin or internally weak result (e.g., a budget missing contingency, a schedule with implausible time slots) ships silently until a human notices. There is also no automated recovery beyond a manual retry button.

**Why it adds production value.** Evaluation ("LLM-as-judge"), guardrails, and self-correction loops are core reliability patterns in production AI. They convert an unpredictable generator into a system with **visible quality gates** and **graceful self-repair** — exactly the "how do you make LLMs reliable?" story that technical conference audiences want, and a genuine step toward production trustworthiness.

**How AI is used.**
- A structured **Evaluator** (extend `AuditorAgent` or add `EvaluatorAgent`) scores each widget against a rubric and returns `confidence` (0–1) plus short reasons — a classic LLM-as-judge with a strict `responseSchema`.
- **Self-heal:** when a widget scores below a threshold, the orchestrator issues **one** automatic refine using the evaluator's critique as the repair brief (the exact `buildRefinePrompt` mechanism already in place), with a hard cap on repair attempts to prevent loops or runaway spend.

**High-level implementation approach.**
- Extend `AUDITOR_SCHEMA` (or a new evaluator schema) with `perWidget: { targetId, confidence, rubricScores, weaknesses[] }`.
- Add `confidence` + reasons to the store, keyed like telemetry; surface a **confidence badge** in `WidgetShell` header (green/amber/rose, reusing the existing `tinted-pill` mixin and semantic tokens).
- Add `AgentOrchestrator.selfHeal(widgetId)` invoked automatically post-audit when `confidence < threshold && repairsUsed < max`; reuse `dispatch()` + ripple + re-audit so downstream stays consistent.
- Make thresholds and max-repairs configurable constants; expose a per-widget "why this score?" tooltip from the evaluator's reasons (using the existing `detail` pattern from `AppError`).
- Add Vitest coverage for the grading schema, threshold logic, and the repair-cap guard (mirrors the existing agent/store spec style).

**Estimated implementation complexity:** Medium (schema + store fields + one bounded loop; the guardrails/caps and UI badge are straightforward extensions of existing patterns).

**Expected user impact.** High trust impact — users see *how good* each result is and watch weak outputs improve without intervention. Strong reliability narrative for the demo ("watch it grade and fix itself").

---

## Feature 5 — Intelligent Model Routing & Cost Governance

> **Status: ⏸️ Deferred.** Valuable production/scalability play but mostly invisible on stage. Best revisited first among the deferred set, since its embedding work is shared with RAG (Feature 2).

**Feature name:** Intelligent Model Routing & Cost Governance — route each task to the right model, cache semantically-equivalent generations, and enforce token/cost budgets.

**Problem it solves.** Model choice is currently a **single global toggle** (`ApiKeyService.mode` → fast vs quality) applied uniformly to every agent, every run. A trivial venue lookup and a complex multi-day schedule pay the same rate; repeated/near-identical briefs re-spend tokens every time; and there is no ceiling to protect a user's quota. `gemini-pricing.ts` already computes cost, but nothing *acts* on it.

**Why it adds production value.** Model routing/cascades, semantic caching, and budget enforcement are the levers real AI products use to control **cost, latency, and scalability** — the difference between a demo and something you can leave running. It also makes the app's already-strong telemetry story *actionable*: the Control Tower can show tokens **and dollars saved**.

**How AI is used.**
- **Routing:** a cheap classifier (a fast-model call or a heuristic on brief length/complexity) assigns each task a tier, so simple tasks use `gemini-3.5-flash` while complex ones escalate to the pro model — a **model cascade**.
- **Semantic cache:** embed each brief; on a cache hit above a cosine-similarity threshold, **return the stored generation and skip the API call entirely** (reuses the embedding infrastructure from Feature 2).

**High-level implementation approach.**
- Add `core/ai/routing/router.service.ts`: `pickModel(agentId, brief)` returning a model id; start heuristic (length, day-count, keyword signals), optionally upgrade to a fast-model complexity classifier.
- Thread a per-task model override into `AgentBase.runStreamed` (currently it always reads the global `ApiKeys.model()`), defaulting to today's behavior so nothing regresses.
- Add `core/ai/cache/semantic-cache.service.ts`: embed brief → cosine lookup over recent generations → serve on hit; record cache hits in telemetry.
- Add pre-dispatch **budget guardrails**: a configurable per-run token/USD ceiling in the store; when exceeded, pause and surface a friendly `AppError`-style prompt instead of silently spending.
- Extend the Control Tower telemetry footer to show **estimated savings** (cache hits + downgraded routes) using `estimateCostUsd`.

**Estimated implementation complexity:** Medium (routing heuristic + cache + budget checks are self-contained; correctness of cache invalidation and per-task model threading are the care-points).

**Expected user impact.** Medium–High. Directly lowers cost and latency (invisible-but-valued in production), protects the user's quota, and turns the existing telemetry into a persuasive "we engineered for scale" demo beat.

---

## Cross-cutting implementation notes

- **State & mutation discipline.** Keep `AgentStore` the single source of truth and `AgentOrchestrator` the only place that mutates the pipeline. New features add stores/services around these contracts rather than bypassing them.
- **Cancellation.** Every new async entry point must acquire a fresh `AbortController` via the existing `freshSignal()` pattern and honor `MissingApiKeyError` + key-cleared cancellation.
- **Errors.** Route every failure through `toAppError()` so users never see raw API text; reuse the inline-retry / snackbar split already in place.
- **Security & privacy.** No new network origins — embeddings, files, and function calling all use the already-whitelisted Gemini host. Keep the key masked, unlogged, and cleared on demand. New inputs (documents, transcripts) stay client-side.
- **Testing.** Mirror the existing Vitest style (schemas, agent streaming/parse, store mutations, error mapping). Priorities: tool-call routing (F1), retrieval ranking (F2), multimodal `Part[]` assembly (F3), grading + repair-cap guards (F4), routing/cache/budget logic (F5).
- **Bundle budget.** Respect the production budgets (initial ≤600 kB warn; per-component style ≤14 kB warn). Lazy-load new heavy paths (chat UI, ingestion, media capture) the same way the SDK, dialog, and widgets already are.

## Reliability foot-gun fixed alongside this work

> **Status: ✅ Fixed — 2026-07-03.**

`AgentStore.globalStatus` previously resolved to `'error'` only when a specialist errored **and** the planner also errored; an isolated total specialist failure still reported `'done'`. This was tightened so `globalStatus` returns `'error'` whenever the planner fails **or** all specialists fail, while genuine partial success still reads `'done'` (each failed widget shows its own error shell). A `hasFailures` computed was added for clearer UI signaling. This underpins the Confidence & Self-Healing loop and also benefits the deferred Cost Governance work (Feature 5).
