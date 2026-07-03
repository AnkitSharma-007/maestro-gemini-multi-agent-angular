# Maestro

> **Five Gemini agents. One natural-language brief. A live, generative Angular dashboard, entirely in your browser.**

Maestro turns a single sentence into a structured event plan rendered as live Angular widgets. It's a working reference for **multi-agent orchestration**, **generative UI**, and **bring-your-own-key** privacy on a static-SPA budget — no backend, no telemetry. Just Angular 22 (zoneless, signals), the `@google/genai` SDK, and a five-agent pipeline.

> _"Plan a 3-day, 1,200-attendee Agentic AI conference in Bengaluru in March 2026, INR ₹2.5 crore budget, with hands-on workshops and a closing fireside."_
>
> ↓ ~12 seconds later
>
> A live **Budget** widget · a multi-day **Schedule** with grounded speaker suggestions · a **Venue** card with real Google-Search citations · an **Auditor** ribbon that catches cross-widget inconsistencies and fixes them with one click.

---

## How it works

You type a brief, hit **Architect Dashboard**, and five agents take over. Each has a single, narrow job and a typed JSON schema:

| Agent        | Role                                                                                             | Returns                         | Tools         |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------- | ------------- |
| **Planner**  | Reads your brief, decides which specialists to run, writes a tailored sub-brief for each.        | Routing + per-specialist briefs | –             |
| **Budget**   | Builds a categorized budget with line items and a totals row.                                    | `BudgetWidgetConfig`            | –             |
| **Schedule** | Builds a multi-day, multi-track schedule with sessions, speakers, and rooms.                     | `ScheduleWidgetConfig`          | Google Search |
| **Venue**    | Picks a venue with capacity, AV, catering, and accessibility notes plus citations.               | `VenueWidgetConfig`             | Google Search |
| **Auditor**  | Cross-checks the widgets for overruns, gaps, and capacity mismatches, and emits one-tap fix-its. | `AuditIssue[]`                  | –             |

The three specialists run **in parallel** under `Promise.allSettled`, so one failure renders an error shell for that widget instead of taking down the dashboard. After settlement, the Auditor runs. Every step streams its `usageMetadata` into the **Control Tower** for live status, duration, token, and USD-cost readouts.

---

## Features

- **Multi-agent orchestration** — Planner + three parallel specialists + Auditor, coordinated by `AgentOrchestrator`, each with its own schema, system prompt, and **per-agent retry**.
- **Generative UI** — `WIDGET_REGISTRY` maps each specialist to a lazy `import()`; `WidgetSlot` instantiates the component through `ViewContainerRef` and updates it in place via `setInput()`. Outputs are real, editable Angular components, not a transcript.
- **Cross-widget ripple** — changing Schedule or Venue marks Budget stale with a one-click **Update**; Auditor fix-its cascade through dependent agents, then re-audit.
- **Per-widget refine bars** — ask for surgical edits ("cut A/V cost by 25%", "swap to an outdoor venue") and only the owning specialist re-runs.
- **Confidence scoring & opt-out auto-repair** — the Auditor scores each widget's quality; widgets below the threshold can be auto-repaired after a run (one extra generation + re-audit per widget, on your own key). It's **on by default, toggleable from the Control Tower** (persisted), and every repair announces its before → after confidence so the extra spend is visible.
- **Multimodal brief intake** — draft a brief by dictating (Web Speech API) or attaching an image/PDF that Gemini reads into an editable prompt before you run.
- **Google-Search grounding** — Schedule and Venue surface real `groundingMetadata` citations as source chips with `rel="noopener noreferrer"`.
- **Friendly, centralized errors** — failures map to a sanitized `AppError` (auth, quota, network, invalid-model, …) shown as a toast or an inline retry shell; raw API text never reaches the UI.
- **BYOK by design** — your Gemini key is validated against `models.list`, stored only in `localStorage`, masked in the UI (`••••abcd`), and never sent to any server we operate.

---

## Quick start

**Prerequisites:** Node 22.22+ (or 24.15+) · npm 8+ · a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) (free tier works). The minimum Node version is enforced via `engines`, and an `.nvmrc` is provided (`nvm use`).

```bash
npm install
npm start          # http://localhost:4200
```

No `.env` needed — the app prompts for your Gemini key on first run and keeps it in `localStorage` only.

### Routes

| Path               | Page                   | Purpose                                               |
| ------------------ | ---------------------- | ----------------------------------------------------- |
| `/`                | Home                   | Feature tour with one-click **Try this brief** demos  |
| `/architect`       | Workspace              | Prompt, Control Tower, audit ribbon, and live widgets |
| `/architect?try=…` | Workspace (pre-filled) | Deep-link a prompt into the textarea                  |

### Commands

```bash
npm start                  # dev server
npm run build              # production build (~129 kB gzip initial transfer)
npm test -- --watch=false  # one-shot unit run (142 tests across 16 files)
npm run lint               # ESLint (angular-eslint) over TS + templates
npm run watch              # dev-config build with watch (no serve)
```

### Deployment

Pure SPA: drop `dist/maestro/browser/` on any static host (Vercel, Netlify, Cloudflare Pages, S3+CloudFront, GitHub Pages…). Configure two things:

1. **SPA fallback** — serve `index.html` for unknown paths so `/architect?try=…` deep-links don't 404.
2. **CSP** — the strict policy in `index.html` uses `script-src 'self'` (no `'unsafe-inline'`; the anti-FOUC theme script is self-hosted in `public/theme-init.js`) and whitelists `https://generativelanguage.googleapis.com` for `connect-src` plus the Google Fonts origins for fonts/styles. `style-src` keeps `'unsafe-inline'` for Angular Material. Extend the relevant directive if your host adds origins.

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

### Data flow

1. **`CommandCenter.submit()`** calls `AgentOrchestrator.run()`, which spawns a fresh `AbortController` for the whole run.
2. **Planner** produces typed JSON: a routing list plus a tailored sub-brief per specialist.
3. **Specialists** dispatch in parallel under `Promise.allSettled`, streaming `usageMetadata` and final payloads into `AgentStore`.
4. **`AgentStore`** is signal-based; updates fan out to `GenerativeRenderer`, which uses `ViewContainerRef.createComponent` against the dynamic import in `WIDGET_REGISTRY` and feeds each widget via `setInput()`.
5. **Auditor** runs after settlement, reviews all widgets together, and emits `auditIssues`; each can be applied via `applyFixIt(id)`, which refines the owning specialist and re-audits.

### Resilience

- Every specialist runs under `Promise.allSettled`, so one failure renders an error-mode widget shell instead of collapsing the dashboard.
- If the **Planner itself errors**, the orchestrator falls back to running all three specialists on the raw brief.
- Grounded outputs that wrap JSON in prose are recovered by a tolerant JSON parser.
- Thrown values are converted to a sanitized `AppError` by `core/errors` and surfaced through a global `ErrorHandler` + snackbar, with inline retry on agent shells.
- Every orchestrator entry point gets a fresh `AbortController`, so switching keys, starting a new run, or unmounting cancels in-flight Gemini streams synchronously.

---

## Project structure

```
src/
├── _mixins.scss                    Shared SCSS design-system mixins
├── styles.scss                     Global tokens, theme blocks, dialog + snackbar overrides
├── index.html                      CSP, OG tags, subsetted Material Symbols font
└── app/
    ├── app.{ts,html,scss}          Shell: topbar + footer + <router-outlet>
    ├── app.routes.ts               Lazy routes: `/` (home) and `/architect` (workspace)
    ├── app.config.ts               Zoneless CD, router, and global ErrorHandler
    │
    ├── core/                       Pure logic, no DOM
    │   ├── ai/
    │   │   ├── agents/             planner · auditor · budget · schedule · venue · base
    │   │   ├── intake/             Multimodal brief intake (image/PDF → editable brief)
    │   │   ├── agent-orchestrator.service.ts   Run / refine / fix-it / ripple / re-audit / retry / self-heal
    │   │   ├── gemini.schemas.ts   Structured-output JSON schemas per agent
    │   │   ├── gemini.prompts.ts   System prompts and brief templates
    │   │   ├── gemini-pricing.ts   USD list prices for cost estimates
    │   │   ├── genai-loader.ts     Lazy dynamic import of @google/genai SDK
    │   │   ├── ripple.ts           Cross-widget dependency prompts
    │   │   └── telemetry-format.ts Token / cost / duration formatting
    │   ├── auth/                   BYOK: validate() against models.list + connect-key dialog
    │   ├── errors/
    │   │   ├── app-error.ts               toAppError() + sanitized AppError model
    │   │   ├── notification.service.ts    MatSnackBar wrapper
    │   │   └── global-error-handler.ts    App-wide ErrorHandler → friendly toast
    │   ├── demo/                   HERO_PROMPT + curated try-this briefs
    │   ├── format/                 Safe formatters (e.g. currency-code normalization)
    │   ├── settings/               Persisted user prefs (auto-repair opt-out)
    │   ├── state/                  Signal store + query-param → textarea hand-off
    │   ├── theme/                  Light/dark, persisted, prefers-color-scheme aware
    │   └── types/                  Discriminated unions, SPECIALIST_META, widget configs
    │
    ├── features/                   UI building blocks
    │   ├── audit-ribbon/           Critic banner + fix-it chips + Re-audit
    │   ├── command-center/         Prompt card + sample chips + no-key empty state
    │   ├── control-tower/          Live agent timeline + per-agent Retry + telemetry
    │   ├── renderer/               WIDGET_REGISTRY (lazy) + WidgetSlot + GenerativeRenderer
    │   └── widgets/                widget-shell · refine-bar · citation-chips + the three widgets
    │
    └── pages/                      Lazy route components: home (`/`) and workspace (`/architect`)
```

---

## Tech stack

| Layer     | Choice                                 | Why                                                                                           |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Framework | **Angular 22 zoneless**                | Smallest reactive surface; signals everywhere; OnPush default.                                |
| State     | **Signals + per-feature stores**       | Computed views; native cancellation via `AbortController`.                                    |
| LLM SDK   | **`@google/genai` v2** (lazy)          | Structured outputs + streaming + Google Search grounding; ~45 kB gzip off the initial bundle. |
| UI kit    | **Angular Material 22**                | Form fields, button toggles, progress bars, snackbars, violet theme.                          |
| Styles    | **SCSS + design-system mixins**        | `glass-surface`, `pill`, `tinted-pill`, breakpoints — DRY source, same emitted CSS.           |
| Routing   | **Standalone routes + lazy loading**   | Pages, the API-key dialog, the SDK, and every widget are lazy chunks.                         |
| Tests     | **Vitest 4** (`jsdom`)                 | 142 tests across 16 files: schemas, agents, store, error mapping, pricing, telemetry, settings. |
| Lint      | **angular-eslint 22** (flat config)    | `typescript-eslint` + Angular template rules incl. accessibility; `npm run lint`.             |
| Build     | **Angular esbuild (`@angular/build`)** | Fast production builds; per-component-style budget at 14 kB warn / 20 kB error.               |

---

## Bundle & security

- **Initial transfer ~129 kB gzip** (549 kB raw). The heavy pieces load on demand: `@google/genai` (~45 kB gzip, first API call), the workspace page, the API-key dialog, and each widget.
- **Performance** — lazy SDK/dialog/widgets/pages keep first paint lean; the Material Symbols font is subsetted to the glyphs actually used; the Control Tower ticker runs at 500 ms and pauses when the tab is hidden; every Gemini stream is tied to an `AbortController`.
- **Security** — strict CSP in `index.html` (`script-src 'self'` with no `'unsafe-inline'`; `connect-src` limited to `generativelanguage.googleapis.com`, plus `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`); `rel="noopener noreferrer"` on external links; no analytics or third-party scripts; the API key is never logged, is masked in the UI, and is wiped on clear. (The key lives in `localStorage` as a deliberate BYOK/no-backend trade-off.)
- **Multimodal intake privacy** — attached images/PDFs are read in-browser and sent (base64-inline) only to the Gemini API on your own key, exactly like a typed brief. Voice input uses the browser's built-in Web Speech API; note that in Chromium browsers this streams audio to the browser vendor's speech service (a browser-level behavior outside the app's CSP), so it is opt-in.

---

## Testing

```bash
npm test -- --watch=false
```

```
 Test Files  16 passed (16)
      Tests  142 passed (142)
```

Specs cover the structured-output schemas, agent streaming + tolerant JSON parsing, store mutations and audit lifecycle (incl. issue-id de-dup and confidence clearing), error mapping (`toAppError`) and classification, BYOK validation, ripple builders, pricing math, telemetry formatting, settings persistence, currency normalization, and the self-heal/intake flows.
