# Maestro

> Multi-agent event orchestration · Gemini

A generative-UI hackathon project that turns one event-planning sentence into a
live dashboard conducted by **five cooperating Gemini agents**. There is **no
backend** — the app runs entirely in your browser, you bring your own
Gemini API key, and the multi-agent pipeline streams structured JSON straight
into Angular components in real time.

> "Plan a 3-day, 1,200-attendee Agentic AI conference in Bengaluru in March 2026,
> INR ₹2.5 crore budget, with hands-on workshops on multi-agent orchestration
> and a closing fireside."
> 
> → 12 seconds later: a live Budget widget, a Schedule widget with grounded
> speaker suggestions, and a Venue card with real Google-Search citations.

---

## What it demonstrates

1. **Generative UI** — the model picks which Angular components to render from a
   widget registry, the renderer instantiates them dynamically with
   `ViewContainerRef.createComponent` and updates them in place via
   `setInput()`.
2. **Multi-agent orchestration** — a Planner agent decomposes the brief, then
   three specialist agents (Budget, Schedule, Venue) run in **parallel** via
   `Promise.allSettled`, each streaming its own structured-output JSON. A fifth
   **Auditor** agent then cross-checks the widgets for inconsistencies.
3. **Critic fix-it chips** — the Auditor surfaces cross-widget issues (e.g.
   venue capacity vs attendee count) as one-click fix-it chips above the
   dashboard; applying a fix re-runs only the target specialist and
   auto-re-audits.
4. **Cross-widget ripple refines** — venue and schedule changes mark the
   budget widget stale; manual refines show a one-click **Update** banner,
   while Auditor fix-its auto-cascade downstream before re-auditing.
5. **Mission Control polish** — live elapsed timers while agents run,
   per-agent **Retry** on failures, and **Replay** to re-watch the last
   timeline without additional API calls.
6. **Token & cost telemetry** — each agent row shows tokens and estimated
   USD from Gemini `usageMetadata`; a run footer totals tokens, cost, and
   wall-clock time (paid-tier list prices; grounding billed separately).
7. **Conversational refinement** — every rendered widget has its own Refine
   bar; refinement re-dispatches **only the owning agent** with the prior
   payload as context, so the other widgets never blink.
8. **Google Search grounding** — the Schedule and Venue agents are grounded
   on Google Search and surface real source citations on the rendered cards.
9. **BYOK** — the user pastes their own Gemini API key once. It is validated
   against `models.list`, stored in `localStorage`, and never leaves their
   browser.
10. **Zoneless Angular 21 + Signals** — `provideZonelessChangeDetection`,
   signal inputs everywhere, `OnPush` throughout, and a slot-based renderer
   that reacts to a joint `(agentStates, widgets)` view of the store.

---

## Architecture at a glance

```
┌──────────────── User prompt ────────────────┐
│         "Plan an event…"                    │
└──────────────────────┬──────────────────────┘
                       ▼
              ┌─────────────────┐
              │  PlannerAgent   │── responseSchema → routing JSON
              └───┬───────┬─────┘
                  ▼       ▼       ▼   (Promise.allSettled)
        ┌─────────────┐ ┌────────────┐ ┌─────────────┐
        │ BudgetAgent │ │ScheduleAg. │ │ VenueAgent  │
        │  (JSON)     │ │ + Search🔍 │ │ + Search🔍  │
        └─────────────┘ └────────────┘ └─────────────┘
                  │       │       │
                  └───────┴───────┘
                          ▼
                  ┌───────────────┐
                  │ AuditorAgent  │── cross-widget consistency JSON
                  └───────┬───────┘
                          ▼
                  AgentStore  (signals)
                          │
          ┌───────────────┴───────────────────────┐
          ▼                                       ▼
   AuditRibbon (fix-it chips)          GenerativeRenderer
          │                             (ghost / real / error slots)
          │ fix-it → refine                      │
          └──────────────────────────────────────┤
                                                 ▼
                                    Budget / Schedule / Venue widgets
                                    (+ Refine bars, grounded citations)
```

Layered project layout under `src/app/`:

| Path | Responsibility |
| --- | --- |
| `core/auth/` | `ApiKeyService` (BYOK + localStorage + `validate()`) and `ApiKeyDialog`. |
| `core/types/` | `agent.types.ts`, `widget.types.ts` — the typed surface area. |
| `core/state/` | `agent.store.ts` — id-keyed widgets, per-agent state, planner rationale, global status. |
| `core/ai/` | `gemini.schemas.ts`, `gemini.prompts.ts`, `gemini-pricing.ts`, `ripple.ts`, `agents/*.agent.ts`, `agent-orchestrator.service.ts`. |
| `features/widgets/` | `widget-shell` (ghost/real/error chrome + refine pulse), `refine-bar`, `citation-chips`, `budget-widget`, `schedule-widget`, `venue-widget`. |
| `features/renderer/` | `widget-slot` (the `ViewContainerRef`-owning element) + `widget-registry` + `generative-renderer`. |
| `features/control-tower/` | `control-tower` — the live mission-control timeline that lights up as agents run. |
| `features/command-center/` | `command-center` (prompt + dashboard) and `no-key-empty-state`. |
| `features/audit-ribbon/` | `audit-ribbon` — critic summary, fix-it chips, re-audit control. |
| `app.ts` / `app.html` / `app.scss` | The shell: top bar, key chip, two-column layout. |

---

## Running locally

Prerequisites: **Node 20+**, **npm 10+**, and a Gemini API key from
[Google AI Studio](https://aistudio.google.com/apikey).

```bash
npm install
npm start          # http://localhost:4200
```

The first time you load the page you'll see the BYOK empty state. Paste your
key, hit **Save & Validate**, and submit the demo prompt — three specialists
stream into the dashboard in parallel, then the Auditor reviews them.

### Other commands

```bash
npm run build      # production build (193 kB gzip initial transfer)
npm test           # vitest, runs in watch mode by default
npm test -- --watch=false   # one-shot test run
```

---

## 60-second demo script

| t  | Action | What to point at |
| -- | --- | --- |
| 0s | App loads, BYOK empty state visible. | "No backend — the user owns the key." |
| 3s | Click **Connect Gemini key**, paste key, **Save & Validate**. | "Validated against `models.list` before we trust it." |
| 8s | Click **Try the demo prompt** chip → click **Architect Dashboard**. | "One sentence in." |
| 9s | Watch **Mission Control** light up: planner → three specialists in parallel. | "Five agents collaborating live." |
| 12s | Three ghost slots appear, then fill in as each agent finishes. | "Slot-based renderer — each widget materialises independently." |
| 16s | **Auditor row** in Mission Control flips to thinking → done; **Audit ribbon** appears above the grid. | "A fifth agent reviews the other three for cross-widget inconsistencies." |
| 18s | If issues appear, point at a fix-it chip (e.g. venue capacity vs attendees). | "The critic caught a real inconsistency — not just three isolated widgets." |
| 22s | Click **Apply fix** on a venue chip → venue refines, budget auto-ripples, ribbon re-audits. | "Critic fix-it → venue updates → budget cascades automatically." |
| 26s | Venue widget shows real **Source chips** (citations). | "Schedule and Venue agents are grounded on Google Search — these are *real* venues, not hallucinations." |
| 28s | **Refine** the Venue widget (e.g. change city to Mumbai), apply. | "Manual refine — only the venue agent re-runs." |
| 32s | Budget widget shows **May be out of date** banner with **Update**. | "The dashboard knows budget depends on venue." |
| 34s | Click **Update** on the budget banner. | "One click — budget refreshes with the new venue as context." |
| 38s | Budget pulses; critic re-audits if applicable. | "Cross-widget dependencies, not three isolated panels." |
| 42s | Point at **live duration** counters ticking on Mission Control rows. | "Timers tick in real time while agents work." |
| 44s | Click **Replay** in Mission Control. | "Re-watch the whole agent choreography — zero extra API spend." |
| 46s | Hover token counts; point at the telemetry footer. | "Every agent reports tokens and estimated cost — full run transparency." |
| 48s | Switch to **Quality** mode in the key dialog and re-submit. | "Same UI, swap in `gemini-3-pro-preview` for higher fidelity." |
| 55s | Recap: zoneless Angular 21, signals, dynamic rendering, planner + specialists + auditor + fix-its, grounded outputs, BYOK. | "All the parts no demo usually has all at once, in 1 MB of JS." |

---

## Resilience notes

- **Single-agent failure isolation**: each specialist runs inside its own
  `try/catch` and `Promise.allSettled` ensures the other widgets render
  regardless. The failed agent renders an error-mode shell so the layout
  stays balanced.
- **Tolerant JSON parsing**: grounded agents occasionally wrap their JSON in
  prose. `parseJsonResponse(raw, allowTolerant=true)` strips ```json fences
  and carves the outer `{ … }` block before re-parsing.
- **Planner failure fallback**: if the planner errors out, the orchestrator
  dispatches all three specialists with the raw user intent as their brief.
- **Auditor failure isolation**: if the auditor errors out, the dashboard and
  fix-it ribbon show "Auditor unavailable"; specialists' widgets remain usable.
  Manual per-widget refines do not trigger re-audit; fix-it chips do.
- **Auth/quota classification**: `classifyApiError` tags errors as
  `auth | quota | network | other` so the snackbar can be honest about why
  things broke.
- **`MissingApiKeyError`** is thrown synchronously when an orchestrator entry
  point is called without a key; the UI surfaces it via snackbar.

---

## Privacy

- The Gemini API key lives **only** in this browser's `localStorage` under
  `dea.geminiApiKey`. It is sent directly from the browser to the Gemini
  endpoint. No server we operate ever sees it.
- No analytics, no logging, no telemetry. The static build artifact contains
  zero credentials.
- The masked key chip shows only the last four characters
  (`••••abcd`). Clearing the key wipes both the in-memory signal and the
  storage entry.

---

## Out of scope / postponed

These were considered and explicitly **not** built (yet) to keep the
hackathon submission tight and demoable:

- Server-side proxy or Vertex AI mode
- Markdown / rich-text widgets
- Save / share dashboards (no persistence)
- Voice prompt entry
- Server-side cost accounting (browser estimates from list prices only)
- Deployment configuration (handled separately by the author)
