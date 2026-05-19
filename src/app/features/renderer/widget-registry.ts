import { Type } from '@angular/core';
import { SpecialistId } from '../../core/types/agent.types';
import { BudgetWidget } from '../widgets/budget-widget';
import { ScheduleWidget } from '../widgets/schedule-widget';
import { VenueWidget } from '../widgets/venue-widget';

export const WIDGET_REGISTRY: Record<SpecialistId, Type<unknown>> = {
  budget: BudgetWidget,
  schedule: ScheduleWidget,
  venue: VenueWidget,
};
