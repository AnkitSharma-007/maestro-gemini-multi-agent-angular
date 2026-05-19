import { Type, type Schema } from '@google/genai';

export const PLANNER_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ['rationale', 'agents'],
  description:
    'Decomposes a user-supplied event-planning brief into a routing plan ' +
    'and per-specialist briefs.',
  properties: {
    rationale: {
      type: Type.STRING,
      description:
        'One short paragraph (under 280 chars) explaining the routing decision. ' +
        'Surfaced in the Control Tower as the planner narrative.',
    },
    agents: {
      type: Type.ARRAY,
      description:
        'One entry per specialist agent. Mark `needed: true` for agents that ' +
        'should run; in practice all three (budget, schedule, venue) are ' +
        'almost always needed for an event-planning brief.',
      items: {
        type: Type.OBJECT,
        required: ['id', 'brief', 'needed'],
        properties: {
          id: {
            type: Type.STRING,
            format: 'enum',
            enum: ['budget', 'schedule', 'venue'],
            description: 'Specialist agent identifier.',
          },
          brief: {
            type: Type.STRING,
            description:
              'A focused paragraph instructing this specialist what to plan. ' +
              'Include any user-provided context (city, attendee count, theme, ' +
              'budget cap) that this agent needs.',
          },
          needed: {
            type: Type.BOOLEAN,
            description:
              'Whether this agent should be dispatched. Default to true unless ' +
              'the user explicitly excludes this dimension.',
          },
        },
      },
    },
  },
};

export const BUDGET_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ['title', 'totalBudget', 'currency', 'lineItems'],
  description: 'A budget breakdown for an event.',
  properties: {
    title: {
      type: Type.STRING,
      description:
        'Short widget title (3-6 words), e.g. "Tentative Budget" or ' +
        '"Bengaluru AI Summit Budget".',
    },
    totalBudget: {
      type: Type.NUMBER,
      description: 'Total budget amount in the given currency.',
    },
    currency: {
      type: Type.STRING,
      description:
        'ISO 4217 currency code (e.g. "USD", "INR", "EUR"). Use the currency ' +
        'most appropriate for the event location, defaulting to "INR" for ' +
        'Indian cities and "USD" otherwise.',
    },
    lineItems: {
      type: Type.ARRAY,
      description:
        '4-7 budget line items, sorted high to low by amount. Each item must ' +
        'have a one-line rationale.',
      items: {
        type: Type.OBJECT,
        required: ['category', 'amount', 'rationale'],
        properties: {
          category: {
            type: Type.STRING,
            description:
              'Category name (e.g. "Venue Rental", "Speaker Honoraria", ' +
              '"AV & Production", "Catering", "Marketing", "Contingency").',
          },
          amount: {
            type: Type.NUMBER,
            description: 'Allocated amount in the chosen currency.',
          },
          rationale: {
            type: Type.STRING,
            description:
              'One-sentence justification for the allocation, grounded in the ' +
              "event's scale and theme.",
          },
        },
      },
    },
  },
};

export const SCHEDULE_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ['title', 'days'],
  description: 'A multi-day session schedule for an event.',
  properties: {
    title: {
      type: Type.STRING,
      description:
        'Short widget title (3-6 words), e.g. "3-Day Agenda" or ' +
        '"Conference Schedule".',
    },
    days: {
      type: Type.ARRAY,
      description:
        'One entry per event day. Match the duration the user asked for.',
      items: {
        type: Type.OBJECT,
        required: ['dayLabel', 'sessions'],
        properties: {
          dayLabel: {
            type: Type.STRING,
            description: 'Human-readable day label, e.g. "Day 1: Opening".',
          },
          date: {
            type: Type.STRING,
            description: 'Optional ISO date string (YYYY-MM-DD) if relevant.',
          },
          sessions: {
            type: Type.ARRAY,
            description: '4-7 sessions per day, in chronological order.',
            items: {
              type: Type.OBJECT,
              required: ['time', 'title'],
              properties: {
                time: {
                  type: Type.STRING,
                  description: 'Session time slot, e.g. "09:00 - 10:00".',
                },
                title: {
                  type: Type.STRING,
                  description: 'Session title.',
                },
                speaker: {
                  type: Type.STRING,
                  description:
                    'Speaker name. When the googleSearch tool is enabled, ' +
                    'prefer a real, currently-active speaker who has spoken on ' +
                    'this topic; otherwise leave blank.',
                },
                track: {
                  type: Type.STRING,
                  description:
                    'Track or theme tag (e.g. "Agentic Systems", "Workshops"). ' +
                    'Optional.',
                },
              },
            },
          },
        },
      },
    },
  },
};

export const VENUE_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: [
    'title',
    'name',
    'city',
    'capacity',
    'amenities',
    'estimatedCost',
    'rationale',
  ],
  description: 'A single recommended venue for an event.',
  properties: {
    title: {
      type: Type.STRING,
      description:
        'Short widget title (3-6 words), e.g. "Recommended Venue".',
    },
    name: {
      type: Type.STRING,
      description:
        'Venue name. With grounding enabled, this MUST be a real, currently ' +
        'operating venue you have verified via search.',
    },
    city: {
      type: Type.STRING,
      description: 'City of the venue (matching the user-provided city).',
    },
    capacity: {
      type: Type.NUMBER,
      description: 'Estimated seated capacity.',
    },
    amenities: {
      type: Type.ARRAY,
      description: '3-6 amenities relevant to a tech event.',
      items: { type: Type.STRING },
    },
    estimatedCost: {
      type: Type.NUMBER,
      description:
        'Estimated total venue cost for the full duration of the event, in ' +
        "the same currency assumed by the budget agent (use the user's " +
        'context to pick).',
    },
    rationale: {
      type: Type.STRING,
      description:
        'One paragraph (under 320 chars) explaining why this venue suits the ' +
        "event's scale, location, and theme.",
    },
  },
};
