import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { ApiKeyDialogService } from '../../core/auth/api-key-dialog.service';
import { ApiKeyService } from '../../core/auth/api-key.service';
import {
  HERO_PROMPT,
  LAUNCH_PROMPT,
  RETREAT_PROMPT,
  SUMMIT_PROMPT,
} from '../../core/demo/sample-prompts';

interface FeatureCard {
  readonly id: string;
  readonly icon: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly tip?: string;
  readonly tryLabel: string;
  readonly tryPrompt: string;
}

const FEATURES: readonly FeatureCard[] = [
  {
    id: 'multi-agent',
    icon: 'hub',
    eyebrow: 'Orchestration',
    title: 'Five Gemini agents collaborating live',
    description:
      'A Planner decomposes your brief into specialist tasks. Three Specialists (Budget, Schedule, Venue) run in parallel. An Auditor cross-checks them for consistency. You watch every step happen.',
    tip: 'Watch the Control Tower on the right to see each agent transition through thinking → streaming → done.',
    tryLabel: 'Try a 3-day conference brief',
    tryPrompt: HERO_PROMPT,
  },
  {
    id: 'generative-ui',
    icon: 'dashboard_customize',
    eyebrow: 'Generative UI',
    title: 'Widgets materialize from streamed JSON',
    description:
      'Each specialist emits a structured JSON payload that gets rendered as a fully styled Angular widget (a budget breakdown, a multi-day schedule, a venue card) instantiated and updated as tokens arrive. No hard-coded templates.',
    tryLabel: 'See widgets render in real time',
    tryPrompt: LAUNCH_PROMPT,
  },
  {
    id: 'byok',
    icon: 'shield_lock',
    eyebrow: 'Privacy',
    title: 'Your Gemini key never leaves the browser',
    description:
      'Maestro is a single-page app with no backend. Your API key lives in localStorage and is used to call Gemini directly from your browser. No proxy, no logging, no telemetry sent anywhere.',
    tip: 'You can switch between Fast and Quality modes; the key is masked in the UI and only ever read for the API call itself.',
    tryLabel: 'Connect a Gemini key',
    tryPrompt: '',
  },
  {
    id: 'refine',
    icon: 'auto_fix_high',
    eyebrow: 'Targeted edits',
    title: 'Per-widget refine bars',
    description:
      'Every widget gets a Refine button. Ask for surgical changes such as "cut A/V cost by 25%", "add a mobile dev track", or "swap to an outdoor venue", and only that specialist re-runs. Faster, cheaper, more focused than re-prompting from scratch.',
    tip: 'After your first run, click Refine on any widget to see scoped editing in action.',
    tryLabel: 'Try a brief, then refine it',
    tryPrompt: SUMMIT_PROMPT,
  },
  {
    id: 'ripple',
    icon: 'sync_problem',
    eyebrow: 'Coordination',
    title: 'Cross-widget ripple updates',
    description:
      'If you tighten the budget, Schedule and Venue are notified automatically. Maestro tracks dependencies between widgets so changes propagate where it matters. No more silently broken plans.',
    tip: 'Run a brief, then refine the Budget to reduce it by 30%, then watch the other widgets flag a stale state and offer a one-click update.',
    tryLabel: 'Trigger a ripple flow',
    tryPrompt: HERO_PROMPT,
  },
  {
    id: 'auditor',
    icon: 'rule',
    eyebrow: 'Quality check',
    title: 'Auditor + one-tap fix-its',
    description:
      'After every run, the Auditor inspects all widgets together and flags inconsistencies: budget overrun, schedule gaps, capacity mismatches. Each flag includes a one-click fix that hands the issue to the right specialist.',
    tip: 'Look for the audit ribbon under the prompt card. Fixes apply with a single tap.',
    tryLabel: 'Surface audit issues',
    tryPrompt:
      'Plan a 2-day 2,000-attendee AI summit in Mumbai next June, INR ₹40 lakh budget, with three parallel tracks and an evening gala dinner.',
  },
  {
    id: 'control-tower',
    icon: 'insights',
    eyebrow: 'Observability',
    title: 'Control Tower with per-agent retry',
    description:
      'A right-side panel shows every agent\u2019s live status (thinking, streaming, done, errored) with a duration ticker that pauses when the tab is hidden. If one agent fails, retry just that agent without rerunning the whole pipeline.',
    tip: 'Submit a brief, then watch the live timeline tick. If anything fails, hit Retry on just that row.',
    tryLabel: 'Watch the timeline live',
    tryPrompt: RETREAT_PROMPT,
  },
  {
    id: 'telemetry',
    icon: 'payments',
    eyebrow: 'Cost transparency',
    title: 'Per-agent tokens, USD cost, latency',
    description:
      'Every agent reports its prompt and completion tokens, estimated USD cost (paid-tier list price), and run duration. Totals roll up into the Control Tower so you can compare runs and budget your evals.',
    tryLabel: 'See full-run telemetry',
    tryPrompt: SUMMIT_PROMPT,
  },
];

@Component({
  selector: 'dea-home-page',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly keyDialog = inject(ApiKeyDialogService);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly router = inject(Router);

  protected readonly features = FEATURES;
  protected readonly heroPrompt = HERO_PROMPT;
  protected readonly hasKey = this.apiKeys.hasKey;

  protected async handleCardCta(card: FeatureCard): Promise<void> {
    if (card.id === 'byok') {
      await this.openKeyDialog();
      return;
    }
    void this.router.navigate(['/architect'], { queryParams: { try: card.tryPrompt } });
  }

  protected async openKeyDialog(): Promise<void> {
    await this.keyDialog.open();
  }
}
