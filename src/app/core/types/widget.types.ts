import type { SpecialistId } from './agent.types';

export type WidgetIntent = 'render_budget' | 'render_schedule' | 'render_venue';

export interface Citation {
  title: string;
  uri: string;
  snippet?: string;
}

export interface BudgetLineItem {
  category: string;
  amount: number;
  rationale: string;
}

export interface BudgetConfig {
  totalBudget: number;
  currency: string;
  lineItems: BudgetLineItem[];
}

export interface ScheduleSession {
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
  rationale: string;
}

export type DynamicComponentConfig =
  | { type: 'render_budget'; title: string; config: BudgetConfig }
  | { type: 'render_schedule'; title: string; config: ScheduleConfig }
  | { type: 'render_venue'; title: string; config: VenueConfig };

export type BudgetResult = { title: string } & BudgetConfig;
export type ScheduleResult = { title: string } & ScheduleConfig;
export type VenueResult = { title: string } & VenueConfig;

export interface SpecialistResultMap {
  budget: BudgetResult;
  schedule: ScheduleResult;
  venue: VenueResult;
}

export type DynamicComponentForId<T extends SpecialistId> = T extends 'budget'
  ? Extract<DynamicComponentConfig, { type: 'render_budget' }>
  : T extends 'schedule'
    ? Extract<DynamicComponentConfig, { type: 'render_schedule' }>
    : Extract<DynamicComponentConfig, { type: 'render_venue' }>;

export function intoComponentConfig<T extends SpecialistId>(
  id: T,
  result: SpecialistResultMap[T],
): DynamicComponentForId<T> {
  switch (id) {
    case 'budget': {
      const { title, ...config } = result as BudgetResult;
      return {
        type: 'render_budget',
        title,
        config,
      } as unknown as DynamicComponentForId<T>;
    }
    case 'schedule': {
      const { title, ...config } = result as ScheduleResult;
      return {
        type: 'render_schedule',
        title,
        config,
      } as unknown as DynamicComponentForId<T>;
    }
    case 'venue':
    default: {
      const { title, ...config } = result as VenueResult;
      return {
        type: 'render_venue',
        title,
        config,
      } as unknown as DynamicComponentForId<T>;
    }
  }
}

export interface WidgetEntry {
  id: SpecialistId;
  agentId: SpecialistId;
  generation: number;
  payload: DynamicComponentConfig;
  citations?: Citation[];
}
