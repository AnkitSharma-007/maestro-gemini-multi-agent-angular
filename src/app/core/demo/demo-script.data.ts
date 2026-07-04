import type { AgentBrief, AuditorOutput, SpecialistId } from '../types/agent.types';
import type { TokenUsage } from '../types/telemetry.types';
import type {
  BudgetResult,
  Citation,
  ScheduleResult,
  VenueResult,
} from '../types/widget.types';
import { HERO_PROMPT } from './sample-prompts';

/**
 * Canned data for the keyless "Watch a sample run" demo. This is a faithful,
 * hand-authored replay of a real Maestro run for `HERO_PROMPT` — the exact shapes
 * the live agents would return, so it flows through `intoComponentConfig` and the
 * real widgets untouched. Nothing here ever hits the network.
 *
 * The Budget deliberately ships with a rebalancing weakness (A/V high,
 * contingency low) so the scripted auditor can flag it and the self-heal beat
 * can visibly fix it (confidence 0.55 → 0.90). This module is lazy-imported by
 * `DemoModeService.start()` so the canned data never lands in the initial bundle.
 */

/** Per-phase delays (ms) for the scripted timeline; consumed in later phases. */
export interface DemoTimings {
  plannerThinkMs: number;
  plannerStreamMs: number;
  specialistStaggerMs: number;
  specialistThinkMs: number;
  specialistStreamMs: number;
  auditThinkMs: number;
  auditStreamMs: number;
  healDelayMs: number;
  healStreamMs: number;
  reAuditMs: number;
  completeDwellMs: number;
}

export interface DemoSpecialistScript<R> {
  result: R;
  citations?: Citation[];
  usage: TokenUsage;
}

export interface DemoRunData {
  intent: string;
  /** Real model id so `estimateCostUsd` produces a plausible (clearly-labeled) total. */
  model: string;
  planner: { rationale: string; agents: AgentBrief[]; usage: TokenUsage };
  budget: DemoSpecialistScript<BudgetResult>;
  schedule: DemoSpecialistScript<ScheduleResult>;
  venue: DemoSpecialistScript<VenueResult>;
  auditor: {
    initial: AuditorOutput;
    healed: AuditorOutput;
    usage: TokenUsage;
    reAuditUsage: TokenUsage;
  };
  heal: { targetId: SpecialistId; healedResult: BudgetResult; usage: TokenUsage };
  timings: DemoTimings;
}

const INR = 'INR';

/** Grounding sources the Schedule/Venue agents would have surfaced. */
const SCHEDULE_CITATIONS: Citation[] = [
  {
    title: 'Multi-agent system — Wikipedia',
    uri: 'https://en.wikipedia.org/wiki/Multi-agent_system',
  },
  {
    title: 'Bengaluru — Wikipedia',
    uri: 'https://en.wikipedia.org/wiki/Bengaluru',
  },
];

const VENUE_CITATIONS: Citation[] = [
  {
    title: 'Bangalore International Exhibition Centre — Wikipedia',
    uri: 'https://en.wikipedia.org/wiki/Bangalore_International_Exhibition_Centre',
  },
  {
    title: 'BIEC — official site',
    uri: 'https://biec.in/',
  },
];

const BUDGET_INITIAL: BudgetResult = {
  title: 'Budget breakdown',
  totalBudget: 25_000_000,
  currency: INR,
  lineItems: [
    {
      category: 'Venue & facilities',
      amount: 6_000_000,
      rationale: 'Three-hall + workshop layout at BIEC for 3 days, incl. setup and teardown.',
    },
    {
      category: 'Catering (3 days × 1,200)',
      amount: 5_400_000,
      rationale: 'Breakfast, lunch, hi-tea and one gala dinner at ~₹500 per head per day.',
    },
    {
      category: 'Speaker travel & honoraria',
      amount: 3_500_000,
      rationale: 'Flights, stay and honoraria for ~30 international and domestic speakers.',
    },
    {
      category: 'A/V & production',
      amount: 3_200_000,
      rationale: 'Stage, LED walls, live streaming and recording across three tracks.',
    },
    {
      category: 'Marketing & branding',
      amount: 2_400_000,
      rationale: 'Pre-event campaigns, signage, and on-site branding.',
    },
    {
      category: 'Workshops & compute credits',
      amount: 2_000_000,
      rationale: 'Hands-on labs, GPU/compute credits and materials for orchestration workshops.',
    },
    {
      category: 'Staffing & security',
      amount: 1_500_000,
      rationale: 'Event crew, registration desk, and on-site security for 3 days.',
    },
    {
      category: 'Contingency',
      amount: 1_000_000,
      rationale: 'Buffer for overruns (~4%).',
    },
  ],
};

const BUDGET_HEALED: BudgetResult = {
  title: 'Budget breakdown',
  totalBudget: 25_000_000,
  currency: INR,
  lineItems: [
    {
      category: 'Venue & facilities',
      amount: 6_000_000,
      rationale: 'Three-hall + workshop layout at BIEC for 3 days, incl. setup and teardown.',
    },
    {
      category: 'Catering (3 days × 1,200)',
      amount: 5_400_000,
      rationale: 'Breakfast, lunch, hi-tea and one gala dinner at ~₹500 per head per day.',
    },
    {
      category: 'Speaker travel & honoraria',
      amount: 3_500_000,
      rationale: 'Flights, stay and honoraria for ~30 international and domestic speakers.',
    },
    {
      category: 'A/V & production',
      amount: 2_600_000,
      rationale: 'Optimized to two primary stages sharing a single streaming/recording rig.',
    },
    {
      category: 'Marketing & branding',
      amount: 2_400_000,
      rationale: 'Pre-event campaigns, signage, and on-site branding.',
    },
    {
      category: 'Workshops & compute credits',
      amount: 2_000_000,
      rationale: 'Hands-on labs, GPU/compute credits and materials for orchestration workshops.',
    },
    {
      category: 'Staffing & security',
      amount: 1_500_000,
      rationale: 'Event crew, registration desk, and on-site security for 3 days.',
    },
    {
      category: 'Contingency',
      amount: 1_600_000,
      rationale: 'Buffer raised to ~6.4% to de-risk overruns.',
    },
  ],
};

const SCHEDULE: ScheduleResult = {
  title: '3-day agenda',
  days: [
    {
      dayLabel: 'Day 1 · Foundations & hands-on workshops',
      date: 'Mar 10, 2026',
      sessions: [
        { time: '09:00 – 09:45', title: 'Registration & breakfast' },
        {
          time: '09:45 – 10:30',
          title: 'Opening keynote: The agentic era',
          speaker: 'Dr. Aarti Nair',
          track: 'Plenary',
        },
        {
          time: '10:45 – 12:30',
          title: 'Workshop: Building multi-agent systems 101',
          speaker: 'Rohan Mehta',
          track: 'Workshop A',
        },
        {
          time: '13:30 – 15:00',
          title: 'Workshop: Tool use & function calling',
          speaker: 'Lena Fischer',
          track: 'Workshop B',
        },
        {
          time: '15:30 – 17:00',
          title: 'Panel: Agents in production',
          track: 'Plenary',
        },
      ],
    },
    {
      dayLabel: 'Day 2 · Multi-agent orchestration deep dives',
      date: 'Mar 11, 2026',
      sessions: [
        {
          time: '09:30 – 10:15',
          title: 'Keynote: Orchestration at scale',
          speaker: 'Sam Okonkwo',
          track: 'Plenary',
        },
        {
          time: '10:30 – 12:00',
          title: 'Deep dive: Planner–executor patterns',
          speaker: 'Priya Raman',
          track: 'Track 1',
        },
        {
          time: '10:30 – 12:00',
          title: 'Deep dive: Memory & retrieval for agents',
          speaker: 'Marco Rossi',
          track: 'Track 2',
        },
        {
          time: '13:00 – 14:30',
          title: 'Lab: Self-healing agent pipelines',
          speaker: 'Rohan Mehta',
          track: 'Workshop A',
        },
        {
          time: '15:00 – 16:30',
          title: 'Case studies: Enterprise rollouts',
          track: 'Track 1',
        },
      ],
    },
    {
      dayLabel: 'Day 3 · Production, safety & closing fireside',
      date: 'Mar 12, 2026',
      sessions: [
        {
          time: '09:30 – 10:15',
          title: 'Keynote: Evaluating agent reliability',
          speaker: 'Dr. Aarti Nair',
          track: 'Plenary',
        },
        {
          time: '10:30 – 12:00',
          title: 'Workshop: Guardrails & evaluation',
          speaker: 'Lena Fischer',
          track: 'Workshop B',
        },
        {
          time: '13:00 – 14:30',
          title: 'Roundtable: Open problems in orchestration',
          track: 'Track 1',
        },
        {
          time: '15:00 – 16:00',
          title: 'Closing fireside: The road to autonomous teams',
          speaker: 'Sam Okonkwo & Priya Raman',
          track: 'Plenary',
        },
        { time: '16:00 – 16:30', title: 'Closing remarks & networking' },
      ],
    },
  ],
};

const VENUE: VenueResult = {
  title: 'Recommended venue',
  name: 'Bangalore International Exhibition Centre (BIEC)',
  city: 'Bengaluru, India',
  capacity: 1_500,
  amenities: [
    '5 modular halls + 3 workshop rooms',
    '1,500-seat plenary hall',
    'On-site A/V, fibre internet & streaming',
    'In-house catering & green rooms',
    'Metro access + 3,000-car parking',
  ],
  estimatedCost: 6_000_000,
  currency: INR,
  rationale:
    'BIEC comfortably fits 1,200 attendees with ~20% headroom, supports three parallel tracks plus hands-on labs, and its integrated A/V and catering cut vendor coordination for a 3-day program.',
};

const AUDIT_INITIAL: AuditorOutput = {
  summary:
    'A well-grounded, right-sized plan. The schedule balances plenaries with hands-on labs and the venue fits comfortably. One budget rebalance would strengthen it.',
  issues: [
    {
      id: 'budget-contingency',
      targetId: 'budget',
      severity: 'warning',
      message:
        'A/V & production (~13%) runs high while contingency sits at ~4%. Rebalance toward a 6–8% buffer to de-risk overruns.',
      autoBrief:
        'Trim A/V & production by ~₹6L and raise contingency to ~₹16L (≈6.4%), keeping the ₹2.5 Cr total unchanged.',
    },
  ],
  confidence: [
    {
      targetId: 'budget',
      confidence: 0.55,
      weaknesses: [
        'A/V & production line looks high for the format',
        'Contingency below the recommended 6–8%',
      ],
    },
    {
      targetId: 'schedule',
      confidence: 0.86,
      weaknesses: [
        'Day 2 morning runs two parallel deep dives in the same slot — confirm room capacity',
      ],
    },
    { targetId: 'venue', confidence: 0.9, weaknesses: [] },
  ],
};

const AUDIT_HEALED: AuditorOutput = {
  summary:
    'All three widgets look production-ready. The budget now carries a healthy ~6.4% contingency, the schedule is well-paced across three tracks, and the venue is grounded and right-sized.',
  issues: [],
  confidence: [
    { targetId: 'budget', confidence: 0.9, weaknesses: [] },
    {
      targetId: 'schedule',
      confidence: 0.86,
      weaknesses: [
        'Day 2 morning runs two parallel deep dives in the same slot — confirm room capacity',
      ],
    },
    { targetId: 'venue', confidence: 0.9, weaknesses: [] },
  ],
};

export const DEMO_TIMINGS: DemoTimings = {
  plannerThinkMs: 700,
  plannerStreamMs: 1100,
  specialistStaggerMs: 350,
  specialistThinkMs: 650,
  specialistStreamMs: 1500,
  auditThinkMs: 700,
  auditStreamMs: 1200,
  healDelayMs: 900,
  healStreamMs: 1300,
  reAuditMs: 900,
  completeDwellMs: 1200,
};

export const DEMO_RUN: DemoRunData = {
  intent: HERO_PROMPT,
  model: 'gemini-3.5-flash',
  planner: {
    rationale:
      'This is a 3-day, 1,200-person flagship conference with a hands-on core, so I split the work across three specialists: a Budget agent to allocate the ₹2.5 Cr across venue, catering, speakers, production and a contingency buffer; a Schedule agent to balance plenary keynotes with parallel workshops on multi-agent orchestration and a closing fireside; and a Venue agent to find a Bengaluru space that fits 1,200 with room for parallel tracks. Schedule and Venue are grounded with Google Search for current, real-world options.',
    agents: [
      {
        id: 'budget',
        brief:
          'Allocate a ₹2.5 crore budget for a 3-day, 1,200-attendee Agentic AI conference in Bengaluru (venue, catering, speakers, A/V/production, marketing, workshops/compute, staffing, contingency).',
        needed: true,
      },
      {
        id: 'schedule',
        brief:
          'Design a 3-day agenda (Mar 10–12, 2026) balancing plenary keynotes with hands-on workshops on multi-agent orchestration and a closing fireside; use parallel tracks where useful.',
        needed: true,
      },
      {
        id: 'venue',
        brief:
          'Recommend a Bengaluru venue for ~1,200 attendees supporting three parallel tracks and hands-on labs across 3 days, with integrated A/V and catering.',
        needed: true,
      },
    ],
    usage: { promptTokens: 820, outputTokens: 340, totalTokens: 1160 },
  },
  budget: {
    result: BUDGET_INITIAL,
    usage: { promptTokens: 1180, outputTokens: 720, totalTokens: 1900 },
  },
  schedule: {
    result: SCHEDULE,
    citations: SCHEDULE_CITATIONS,
    usage: { promptTokens: 1520, outputTokens: 1480, totalTokens: 3000 },
  },
  venue: {
    result: VENUE,
    citations: VENUE_CITATIONS,
    usage: { promptTokens: 1360, outputTokens: 640, totalTokens: 2000 },
  },
  auditor: {
    initial: AUDIT_INITIAL,
    healed: AUDIT_HEALED,
    usage: { promptTokens: 2450, outputTokens: 560, totalTokens: 3010 },
    reAuditUsage: { promptTokens: 2480, outputTokens: 300, totalTokens: 2780 },
  },
  heal: {
    targetId: 'budget',
    healedResult: BUDGET_HEALED,
    usage: { promptTokens: 980, outputTokens: 420, totalTokens: 1400 },
  },
  timings: DEMO_TIMINGS,
};
