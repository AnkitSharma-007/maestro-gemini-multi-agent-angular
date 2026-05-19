import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { CitationChips } from './citation-chips';
import { WidgetShell } from './widget-shell';
import {
  Citation,
  ScheduleConfig,
  ScheduleDay,
} from '../../core/types/widget.types';
import { SpecialistId } from '../../core/types/agent.types';

@Component({
  selector: 'dea-schedule-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    MatTabsModule,
    MatIconModule,
    CitationChips,
    WidgetShell,
  ],
  templateUrl: './schedule-widget.html',
  styleUrl: './schedule-widget.scss',
})
export class ScheduleWidget {
  readonly widgetId = input.required<SpecialistId>();
  readonly title = input.required<string>();
  readonly config = input.required<ScheduleConfig>();
  readonly citations = input<Citation[] | undefined>(undefined);

  protected readonly days = computed<ScheduleDay[]>(() => this.config().days ?? []);
}
