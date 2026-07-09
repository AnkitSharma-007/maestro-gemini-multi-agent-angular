export const HERO_PROMPT =
  'Plan a 3-day, 1,200-attendee Agentic AI conference in Bengaluru in October 2026, INR ₹2.5 crore budget, with hands-on workshops on multi-agent orchestration and a closing fireside.';

export const LAUNCH_PROMPT =
  'Plan a 1-day product launch in San Francisco for 400 press and partners next April, USD $180k budget, with a 90-minute keynote, a hands-on demo lounge, and an evening rooftop reception.';

export const SUMMIT_PROMPT =
  'Plan a 2-day developer summit for 600 engineers in Berlin this October, EUR €420k budget, with two parallel tracks on AI infrastructure and platform engineering, plus a Friday night networking dinner.';

export const RETREAT_PROMPT =
  'Plan a 4-day intimate founders retreat in Bali for 50 invitees in November, USD $260k budget, mixing strategy workshops, surf sessions, and a closing dinner at a private villa.';

export interface SamplePrompt {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly prompt: string;
}

export const SAMPLE_PROMPTS: readonly SamplePrompt[] = [
  { id: 'launch', icon: 'rocket_launch', label: 'Product launch', prompt: LAUNCH_PROMPT },
  { id: 'summit', icon: 'school', label: 'Developer summit', prompt: SUMMIT_PROMPT },
  { id: 'retreat', icon: 'celebration', label: 'Founders retreat', prompt: RETREAT_PROMPT },
];
