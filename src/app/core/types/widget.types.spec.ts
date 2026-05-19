import { describe, expect, it } from 'vitest';
import {
  BudgetResult,
  intoComponentConfig,
  ScheduleResult,
  VenueResult,
} from './widget.types';

describe('intoComponentConfig', () => {
  it('wraps a BudgetResult into a render_budget envelope', () => {
    const result: BudgetResult = {
      title: 'Conference Budget',
      totalBudget: 50000,
      currency: 'USD',
      lineItems: [
        { category: 'Venue Rental', amount: 20000, rationale: 'Two-day hold.' },
      ],
    };

    const config = intoComponentConfig('budget', result);

    expect(config).toEqual({
      type: 'render_budget',
      title: 'Conference Budget',
      config: {
        totalBudget: 50000,
        currency: 'USD',
        lineItems: [
          { category: 'Venue Rental', amount: 20000, rationale: 'Two-day hold.' },
        ],
      },
    });
  });

  it('wraps a ScheduleResult into a render_schedule envelope', () => {
    const result: ScheduleResult = {
      title: '2-Day Agenda',
      days: [
        {
          dayLabel: 'Day 1: Kickoff',
          sessions: [{ time: '09:00 - 10:00', title: 'Welcome' }],
        },
      ],
    };

    const config = intoComponentConfig('schedule', result);

    expect(config.type).toBe('render_schedule');
    expect(config.title).toBe('2-Day Agenda');
    if (config.type === 'render_schedule') {
      expect(config.config.days).toHaveLength(1);
      expect(config.config.days[0].sessions[0].title).toBe('Welcome');
    }
  });

  it('wraps a VenueResult into a render_venue envelope', () => {
    const result: VenueResult = {
      title: 'Recommended Venue',
      name: 'Acme Convention Hall',
      city: 'Bengaluru',
      capacity: 1500,
      amenities: ['Wi-Fi', 'AV', 'Catering'],
      estimatedCost: 1800000,
      currency: 'INR',
      rationale: 'Right-sized for 1200 attendees.',
    };

    const config = intoComponentConfig('venue', result);

    expect(config.type).toBe('render_venue');
    if (config.type === 'render_venue') {
      expect(config.config.name).toBe('Acme Convention Hall');
      expect(config.config.currency).toBe('INR');
      expect(config.config.amenities).toHaveLength(3);
    }
  });

  it('does not leak `title` into the config payload', () => {
    const result: BudgetResult = {
      title: 'X',
      totalBudget: 1,
      currency: 'USD',
      lineItems: [],
    };
    const config = intoComponentConfig('budget', result);
    expect(config.config).not.toHaveProperty('title');
  });
});
