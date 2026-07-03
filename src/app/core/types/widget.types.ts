import type { SpecialistId } from './agent.types';

export interface Citation {
  title: string;
  uri: string;
}

interface BudgetLineItem {
  category: string;
  amount: number;
  rationale: string;
}

export interface BudgetConfig {
  totalBudget: number;
  currency: string;
  lineItems: BudgetLineItem[];
}

interface ScheduleSession {
  time: string;
  title: string;
  speaker?: string;
  track?: string;
}

export interface ScheduleDay {
  dayLabel: string;
  date?: string;
  sessions: ScheduleSession[];
}

export interface ScheduleConfig {
  days: ScheduleDay[];
}

export interface VenueConfig {
  name: string;
  city: string;
  capacity: number;
  amenities: string[];
  estimatedCost: number;
  currency: string;
  rationale: string;
}

export type DynamicComponentConfig =
  | { type: 'render_budget'; title: string; config: BudgetConfig }
  | { type: 'render_schedule'; title: string; config: ScheduleConfig }
  | { type: 'render_venue'; title: string; config: VenueConfig };

export type BudgetResult = { title: string } & BudgetConfig;
export type ScheduleResult = { title: string } & ScheduleConfig;
export type VenueResult = { title: string } & VenueConfig;

interface SpecialistResultMap {
  budget: BudgetResult;
  schedule: ScheduleResult;
  venue: VenueResult;
}

export function intoComponentConfig<T extends SpecialistId>(
  id: T,
  result: SpecialistResultMap[T],
): DynamicComponentConfig {
  switch (id) {
    case 'budget': {
      const { title, ...config } = result as BudgetResult;
      return { type: 'render_budget', title, config };
    }
    case 'schedule': {
      const { title, ...config } = result as ScheduleResult;
      return { type: 'render_schedule', title, config };
    }
    case 'venue': {
      const { title, ...config } = result as VenueResult;
      return { type: 'render_venue', title, config };
    }
  }
}

export interface WidgetEntry {
  id: SpecialistId;
  generation: number;
  payload: DynamicComponentConfig;
  citations?: Citation[];
}
