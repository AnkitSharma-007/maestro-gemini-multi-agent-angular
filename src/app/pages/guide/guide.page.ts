import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { ApiKeyService } from '../../core/auth/api-key.service';

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

const HERO_PROMPT =
  'Plan a 3-day, 1,200-attendee Agentic AI conference in Bengaluru in March 2026, INR ₹2.5 crore budget, with hands-on workshops on multi-agent orchestration and a closing fireside.';

const LAUNCH_PROMPT =
  'Plan a 1-day product launch in San Francisco for 400 press and partners next April, USD $180k budget, with a 90-minute keynote, a hands-on demo lounge, and an evening rooftop reception.';

const SUMMIT_PROMPT =
  'Plan a 2-day developer summit for 600 engineers in Berlin this October, EUR €420k budget, with two parallel tracks on AI infrastructure and platform engineering, plus a Friday night networking dinner.';

const RETREAT_PROMPT =
  'Plan a 4-day intimate founders retreat in Bali for 50 invitees in November, USD $260k budget, mixing strategy workshops, surf sessions, and a closing dinner at a private villa.';

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
  selector: 'dea-guide-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, RouterLink],
  templateUrl: './guide.page.html',
  styleUrl: './guide.page.scss',
})
export class GuidePage {
  private readonly dialog = inject(MatDialog);
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
    const { ApiKeyDialog } = await import('../../core/auth/api-key.dialog');
    this.dialog.open(ApiKeyDialog, {
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'dea-dialog-panel',
    });
  }
}
