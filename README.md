# Maestro

> **Five Gemini agents. One natural-language brief. A live, generative Angular dashboard, entirely in your browser.**

Maestro turns a single sentence into a fully structured event plan rendered as live Angular widgets. It is a working reference for **multi-agent orchestration**, **generative UI**, and **bring-your-own-key** privacy on a strict static-SPA budget. No backend. No telemetry. No frameworks-on-top-of-frameworks. Just Angular 21 (zoneless, signals), the `@google/genai` SDK, and a five-agent pipeline.

> _"Plan a 3-day, 1,200-attendee Agentic AI conference in Bengaluru in March 2026, INR ₹2.5 crore budget, with hands-on workshops on multi-agent orchestration and a closing fireside."_
>
> ↓ ~12 seconds later
>
> A live **Budget** widget · a multi-day **Schedule** widget with grounded speaker suggestions · a **Venue** card with real Google-Search citations · an **Auditor ribbon** that catches cross-widget inconsistencies and fixes them with one click.

---

## Contents

- [Why this exists](#why-this-exists)
- [How it works](#how-it-works)
- [Features](#features)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)
- [Bundle, performance & security](#bundle-performance--security)
- [Testing](#testing)

---

## Why this exists

Most LLM demos are a single chat window talking to a single model. Real product surfaces are not chat windows: they are dashboards, forms, plans, reports, dossiers. Maestro is a small, self-contained example of what it takes to build one of those *properly*:

- A **typed multi-agent pipeline** where each agent has its own role, schema, and failure mode.
- **Structured outputs** that materialize as **real Angular components**, not prose, not Markdown tables.
- **Cross-widget coordination** so edits in one place ripple into the others.
- A **deployment story** (static SPA, BYOK, strict CSP, ~129 kB initial gzip) suitable for a real product, not a notebook.

If you want to see how Angular 21 signals, lazy components via `ViewContainerRef`, and Gemini structured outputs fit together end-to-end, this repo is meant to read like a guided tour of that pattern.

---

## How it works

You type a brief, hit **Architect Dashboard**, and five agents take over. Each one has a single, narrow job and a typed JSON schema:

| Agent | Role | Schema returns | Tools |
|---|---|---|---|
| **Planner** | Reads your brief, decides which specialists to run, writes a tailored sub-brief for each. | Routing + per-specialist briefs | – |
| **Budget specialist** | Builds a categorized budget with line items and a totals row. | `BudgetWidgetConfig` | – |
| **Schedule specialist** | Builds a multi-day, multi-track schedule with sessions, speakers, and rooms. | `ScheduleWidgetConfig` | Google Search grounding |
| **Venue specialist** | Picks a venue and lists capacity, AV, catering, and accessibility notes with citations. | `VenueWidgetConfig` | Google Search grounding |
| **Auditor** | Cross-checks all three widgets for budget overruns, schedule gaps, capacity mismatches, etc. and emits one-tap fix-its. | List of `AuditIssue` | – |

The three specialists run **in parallel** under `Promise.allSettled`, so one failure renders an error-shell for that widget instead of taking down the whole dashboard. After settlement, the Auditor runs. Every step streams its `usageMetadata` into the **Control Tower**, which shows live status, duration, tokens, and a USD cost estimate per agent.

---

## Features

1. **Multi-agent orchestration with retry surface.** Planner + three Specialists (parallel) + Auditor, coordinated by `AgentOrchestrator`. Each agent has its own typed `responseSchema`, its own system prompt, and its own **per-agent Retry** in the Control Tower so a flaky call doesn't force you to rerun the pipeline.
2. **Generative UI via lazy widget registry.** `WIDGET_REGISTRY` maps each `SpecialistId` → a dynamic `import()`. `WidgetSlot` owns a `ViewContainerRef`, instantiates the matched component on demand, and updates it in place via `setInput()` as new payloads arrive. Outputs are real Angular components you can edit widget-by-widget, not a transcript.
3. **Cross-widget ripple updates.** When Schedule or Venue change, the Budget widget marks itself stale and shows a one-click **Update** banner. Auditor fix-its auto-cascade through dependent agents before re-auditing.
4. **Auditor fix-it chips.** Inconsistencies (capacity mismatches, schedule gaps, budget overruns) surface as one-tap chips that re-run the owning specialist and re-audit automatically.
5. **Live Control Tower.** Per-agent timeline that ticks duration in real time (paused when the tab is hidden to save cycles), reports every agent's `usageMetadata` and a USD estimate from `gemini-pricing.ts`, and supports per-agent retry on failure.
6. **Google-Search grounding.** Schedule and Venue agents enable `googleSearchTool`. The rendered widgets surface real `groundingMetadata` citations as **Source chips** with `rel="noopener noreferrer"`.
7. **Per-widget refine bars.** Every widget has its own Refine input. Ask for surgical edits ("cut A/V cost by 25%", "swap to an outdoor venue") and only the owning specialist re-runs. Faster, cheaper, and more focused than re-prompting from scratch.
8. **BYOK by design.** Your Gemini key is validated against `models.list`, stored only in `localStorage` under `dea.geminiApiKey`, masked in the UI (`••••abcd`), and never reaches any server we operate. Clearing the key wipes both the in-memory signal and the storage entry.

---

## Quick start

**Prerequisites:** Node 20+ · npm 10+ · a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) (free tier works).

```bash
npm install
npm start          # http://localhost:4200
```

You **don't** need an `.env` file. On first run, the app prompts for your Gemini key in a dialog and stores it in `localStorage` only.

### Routes

| Path | Page | Purpose |
|------|------|---------|
| `/` | Home | Feature tour with one-click **Try this brief** demos |
| `/architect` | Workspace | Prompt, Control Tower, audit ribbon, and live widgets |
| `/architect?try=…` | Workspace (pre-filled) | Deep-link a prompt into the textarea |

First load lands on **home** at `/`. Click any **Try this brief** card to open the workspace at `/architect` with the prompt pre-filled, connect your Gemini key in the dialog, then hit **Architect Dashboard**.

### Other commands

```bash
npm run build              # production build (~129 kB gzip initial transfer)
npm test                   # vitest watch mode (87 tests across 10 files)
npm test -- --run          # one-shot test run
npm run watch              # dev-config build with watch (no serve)
```

### Deployment notes

This is a pure SPA: drop `dist/maestro/browser/` on any static host (Vercel, Netlify, Cloudflare Pages, S3+CloudFront, GitHub Pages…). Two things to configure on the host:

1. **SPA fallback.** Serve `index.html` for unknown paths so `/architect?try=…` deep-links don't 404.
2. **CSP.** The strict CSP in `index.html` already whitelists `https://generativelanguage.googleapis.com` for outbound calls and `https://fonts.googleapis.com` / `https://fonts.gstatic.com` for the Material Symbols font. If your host adds extra script origins, extend `script-src` accordingly.

---

## Architecture

```
┌──────────────────── User brief ─────────────────────┐
│  "Plan a 3-day Agentic AI conference in Bengaluru…" │
└──────────────────────────┬──────────────────────────┘
                           ▼
                ┌────────────────────┐
                │   PlannerAgent     │  responseSchema → routing JSON
                │   (decomposition)  │  + per-specialist briefs
                └───┬─────┬─────┬────┘
                    ▼     ▼     ▼          Promise.allSettled
        ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
        │ BudgetAgent │ │ScheduleAgent │ │ VenueAgent   │
        │  (JSON)     │ │  + Search🔍  │ │  + Search🔍  │
        └──────┬──────┘ └──────┬───────┘ └──────┬───────┘
               │               │                │
               └───────┬───────┴────────────────┘
                       ▼
                ┌──────────────┐
                │ AuditorAgent │  cross-widget consistency JSON
                └──────┬───────┘
                       ▼
            ╔════════════════════════════╗
            ║   AgentStore (signals)     ║   id-keyed widgets,
            ║                            ║   per-agent state,
            ║                            ║   global status, telemetry
            ╚══════════════╤═════════════╝
                           │
       ┌───────────────────┼──────────────────────────┐
       ▼                   ▼                          ▼
  AuditRibbon         ControlTower               GenerativeRenderer
  (fix-it chips)      (timeline, telemetry,      (ghost → real → error
       │               per-agent retry)           shells via ViewContainerRef)
       │ apply fix                                    │
       └──────────────────► refine specialist  ───────┤
                                                      ▼
                                          Budget / Schedule / Venue widgets
                                          (+ Refine bars, Citation chips,
                                           Stale-state banners)
```

### Data flow, step by step

1. **`CommandCenter.submit()`** is invoked from the prompt card. It calls `AgentOrchestrator.run()`, which spawns a fresh `AbortController` for the whole run.
2. **Planner** produces typed JSON: a routing list plus a tailored sub-brief per specialist.
3. **Specialists** dispatch in parallel under `Promise.allSettled`. Each one streams its `usageMetadata` and final JSON payload into `AgentStore`.
4. **`AgentStore`** is signal-based; updates fan out to `GenerativeRenderer`, which uses `ViewContainerRef.createComponent` against the dynamic-import in `WIDGET_REGISTRY` to instantiate the right Angular widget and feed it the payload via `setInput()`.
5. **Auditor** runs after settlement, reviews all widgets together, and emits `auditIssues`. Each issue can be applied via `applyFixIt(id)`, which `refine()`s the owning specialist and re-audits.

### Resilience built into the pipeline

- Every specialist runs inside `try/catch` under `Promise.allSettled`, so one failure renders an `error-mode` widget shell rather than collapsing the dashboard.
- If the **Planner itself errors**, the orchestrator falls back to running all three specialists directly on the raw user brief.
- Grounded outputs that wrap JSON in surrounding prose (a common Gemini behavior with Google Search) are recovered by a tolerant JSON parser.
- Errors are classified (`auth | quota | network | other`) so the snackbar can be specific instead of generic.
- Every orchestrator entry point gets a fresh `AbortController`, so switching keys, starting a new run, or unmounting cancels all in-flight Gemini streams synchronously.

---

## Project structure

Each agent gets its own file. Each widget gets its own component. Each page gets its own lazy chunk.

```
src/
├── _mixins.scss                    Shared SCSS design-system mixins
├── styles.scss                     Global tokens, theme blocks, dialog overrides
├── index.html                      CSP, OG tags, subsetted Material Symbols font
└── app/
    ├── app.{ts,html,scss}          Shell: topbar + footer + <router-outlet>
    ├── app.routes.ts               Lazy routes: `/` (home) and `/architect` (workspace)
    ├── app.config.ts               provideZonelessChangeDetection, provideRouter, providers
    │
    ├── core/                       Pure logic, no DOM
    │   ├── ai/
    │   │   ├── agents/             planner · auditor · budget · schedule · venue · base
    │   │   ├── agent-orchestrator.service.ts   Run / refine / fix-it / ripple / re-audit / retry
    │   │   ├── gemini.schemas.ts   Structured-output JSON schemas per agent
    │   │   ├── gemini.prompts.ts   System prompts and brief templates
    │   │   ├── gemini-pricing.ts   USD list prices for cost estimates
    │   │   ├── genai-loader.ts     Lazy dynamic import of @google/genai SDK
    │   │   ├── ripple.ts           Cross-widget dependency prompts
    │   │   └── telemetry-format.ts Token / cost / duration formatting
    │   ├── auth/
    │   │   ├── api-key.service.ts          BYOK + validate() against models.list
    │   │   ├── api-key-dialog.service.ts   Lazy opener for the connect-key modal
    │   │   └── api-key.dialog.{ts,html,scss}
    │   ├── demo/
    │   │   └── sample-prompts.ts   HERO_PROMPT + curated try-this briefs
    │   ├── state/
    │   │   ├── agent.store.ts             Signal store: widgets, agent state, telemetry, audit, rationale
    │   │   └── prompt-draft.service.ts    Query-param → textarea hand-off
    │   ├── theme/
    │   │   └── theme.service.ts    Light/dark, persisted, prefers-color-scheme aware
    │   └── types/
    │       ├── agent.types.ts      Discriminated unions, SPECIALIST_META, error classes
    │       └── widget.types.ts     Widget config types + RENDER_TYPE_BY_ID
    │
    ├── features/                   UI building blocks
    │   ├── audit-ribbon/           Critic banner + fix-it chips + Re-audit button
    │   ├── command-center/         Prompt card + sample chips + no-key empty state
    │   ├── control-tower/          Live agent timeline + per-agent Retry + Telemetry
    │   ├── renderer/               WIDGET_REGISTRY (lazy) + WidgetSlot + GenerativeRenderer
    │   └── widgets/                widget-shell · refine-bar · citation-chips
    │                               · budget-widget · schedule-widget · venue-widget
    │
    └── pages/                      Route components (both lazy-loaded)
        ├── home/                   Home (`/`): feature tour with one-click "Try this brief" CTAs
        └── workspace/              Workspace (`/architect`): Command Center + Control Tower + Audit ribbon + dashboard
```

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Angular 21 zoneless** (`provideZonelessChangeDetection`) | Smallest reactive surface; signals everywhere; OnPush throughout. |
| State | **Signals + per-feature stores** | No `effect` indirection; computed views; native cancellation via `AbortController`. |
| LLM SDK | **`@google/genai` v2** (lazy-loaded) | Native structured outputs + streaming + Google Search grounding. ~100 kB removed from the initial bundle by dynamic import. |
| UI kit | **Angular Material 21** | `mat-form-field`, `mat-button-toggle`, `mat-progress-bar`, `mat-snack-bar` + theming with a violet palette. |
| Styles | **SCSS + design-system mixins** (`src/_mixins.scss`) | `glass-surface`, `pill`, `tinted-pill`, `eyebrow`, `mono-tabular`, named breakpoints. Keeps source DRY without changing emitted CSS. |
| Routing | **Standalone routes + lazy loading** | Both pages, the API-key dialog, the Gemini SDK, and every widget are lazy chunks. |
| Tests | **Vitest 4** (`jsdom`) | Faster than Karma. 87 tests covering schemas, agents, store mutations, telemetry math, theme service. |
| Build | **Angular esbuild (`@angular/build`)** | ~2 s production builds. Per-component-style budget enforced at `14 kB` warn / `20 kB` error. |

---

## Bundle, performance & security

### Bundle (production build)

| Chunk | Raw | Gzip transfer | When loaded |
|---|---:|---:|---|
| **Initial total** | 516 kB | **129 kB** | First paint |
| `home-page` (lazy) | 26.5 kB | 6.3 kB | Visit `/` |
| `workspace-page` (lazy) | 68.2 kB | 15.0 kB | Visit `/architect` |
| `api-key-dialog` (lazy) | 43.1 kB | 9.0 kB | First dialog open |
| `@google/genai` (lazy) | 298 kB | 45.2 kB | First API call |
| `schedule-widget` (lazy) | 49.5 kB | 10.7 kB | First Schedule render |
| `budget-widget` / `venue-widget` (lazy) | ~4.8 kB each | ~1.6 kB each | First respective render |

### Performance wins applied

- **Lazy `@google/genai`**: biggest single win, ~100 kB off the initial transfer.
- **Lazy `ApiKeyDialog`**: full Material dialog chunk deferred until first key prompt.
- **Lazy widgets**: each specialist widget is its own dynamic import behind `WIDGET_REGISTRY`.
- **Lazy pages**: first paint serves the leaner `home-page` chunk; the heavier `workspace-page` chunk loads only when someone clicks through.
- **Material Symbols subsetted**: the Google Fonts URL in `index.html` has an explicit `&icon_names=…` list for the exact glyphs the templates use.
- **Live duration ticker** at **500 ms**, and it **pauses when the tab is hidden** (`document.visibilityState !== 'visible'`).
- **`AbortController` on every Gemini stream**: switching keys, starting a new run, retrying, or unmounting cancels all in-flight requests synchronously.

### Security hardening

- **Content-Security-Policy** in `index.html`:
  - `script-src 'self' 'unsafe-inline'`
  - `connect-src 'self' https://generativelanguage.googleapis.com`
  - `font-src 'self' https://fonts.gstatic.com`
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
  - `frame-ancestors 'none'` · `object-src 'none'` · `base-uri 'self'` · `form-action 'none'`
- **`rel="noopener noreferrer"`** on every `target="_blank"` external link.
- **No analytics, no error reporting, no third-party scripts.** The static build is reproducible.
- **The API key** is never logged, never sent anywhere except `generativelanguage.googleapis.com`, and is masked in the UI (`••••abcd`). Clearing the key wipes both the in-memory signal and the `localStorage` entry.

---

## Testing

```bash
npm test -- --run
```

```
 Test Files  10 passed (10)
      Tests  87 passed (87)
```

Specs cover the structured-output schemas, agent base streaming + tolerant JSON parsing, store mutations and audit lifecycle, error classification, BYOK validation, ripple prompt builders, pricing math, and telemetry formatting.
