import { Component, computed, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { CitationChips } from './citation-chips';
import { WidgetShell } from './widget-shell';
import { Citation, VenueConfig } from '../../core/types/widget.types';
import { SpecialistId } from '../../core/types/agent.types';
import { safeCurrencyCode } from '../../core/format/currency';

@Component({
  selector: 'dea-venue-widget',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatIconModule,
    MatChipsModule,
    CitationChips,
    WidgetShell,
  ],
  templateUrl: './venue-widget.html',
  styleUrl: './venue-widget.scss',
})
export class VenueWidget {
  readonly widgetId = input.required<SpecialistId>();
  readonly title = input.required<string>();
  readonly config = input.required<VenueConfig>();
  readonly citations = input<Citation[] | undefined>(undefined);

  protected readonly currencyCode = computed(() => safeCurrencyCode(this.config().currency));
}
