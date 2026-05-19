# Dynamic Event Architect

A generative-UI hackathon project that turns one event-planning sentence into a
live dashboard built by **four cooperating Gemini agents**. There is **no
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
   `Promise.allSettled`, each streaming its own structured-output JSON.
3. **Conversational refinement** — every rendered widget has its own Refine
   bar; refinement re-dispatches **only the owning agent** with the prior
   payload as context, so the other widgets never blink.
4. **Google Search grounding** — the Schedule and Venue agents are grounded
   on Google Search and surface real source citations on the rendered cards.
5. **BYOK** — the user pastes their own Gemini API key once. It is validated
   against `models.list`, stored in `localStorage`, and never leaves their
   browser.
6. **Zoneless Angular 21 + Signals** — `provideZonelessChangeDetection`,
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
                  ▼       ▼       ▼
                  AgentStore  (signals)
                  │       │       │
                  ▼       ▼       ▼
       ┌─────────────────────────────────┐
       │     GenerativeRenderer          │
       │  (slot-per-specialist, ghost /  │
       │   real / error driven by joint  │
       │   agentStates + widgets state)  │
       └──┬──────────────┬──────────────┬┘
          ▼              ▼              ▼
        Budget         Schedule        Venue
        Widget         Widget          Widget
        + Refine       + Refine        + Citations
```

Layered project layout under `src/app/`:

| Path | Responsibility |
| --- | --- |
| `core/auth/` | `ApiKeyService` (BYOK + localStorage + `validate()`) and `ApiKeyDialog`. |
| `core/types/` | `agent.types.ts`, `widget.types.ts` — the typed surface area. |
| `core/state/` | `agent.store.ts` — id-keyed widgets, per-agent state, planner rationale, global status. |
| `core/ai/` | `gemini.schemas.ts`, `gemini.prompts.ts`, `agents/*.agent.ts`, `agent-orchestrator.service.ts`. |
| `features/widgets/` | `widget-shell` (ghost/real/error chrome + refine pulse), `refine-bar`, `citation-chips`, `budget-widget`, `schedule-widget`, `venue-widget`. |
| `features/renderer/` | `widget-slot` (the `ViewContainerRef`-owning element) + `widget-registry` + `generative-renderer`. |
| `features/control-tower/` | `control-tower` — the live mission-control timeline that lights up as agents run. |
| `features/command-center/` | `command-center` (prompt + dashboard) and `no-key-empty-state`. |
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
key, hit **Save & Validate**, and submit the demo prompt — three agents stream
into the dashboard in parallel.

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
| 9s | Watch **Mission Control** light up: planner → three specialists in parallel. | "Four agents collaborating live." |
| 12s | Three ghost slots appear, then fill in as each agent finishes. | "Slot-based renderer — each widget materialises independently." |
| 16s | Venue widget shows real **Source chips** (citations). | "Schedule and Venue agents are grounded on Google Search — these are *real* venues, not hallucinations." |
| 20s | Click the **Refine** button on the Budget widget, type "shrink the venue line item by 30%", apply. | "Conversational refinement — only the Budget agent re-runs." |
| 26s | Budget widget pulses purple as it updates in place; the other widgets and the planner don't blink. | "Per-widget regeneration. The dashboard is alive, not a snapshot." |
| 35s | Switch to **Quality** mode in the key dialog and re-submit. | "Same UI, swap in `gemini-3-pro-preview` for higher fidelity." |
| 50s | Recap: zoneless Angular 21, signals, dynamic component rendering, multi-agent + grounded structured outputs, BYOK, fully static deploy. | "All the parts no demo usually has all at once, in 1 MB of JS." |

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
- Per-agent retry button
- Live ticking duration counter (we update on transitions only)
- Deployment configuration (handled separately by the author)
