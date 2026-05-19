import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CitationChips } from './citation-chips';
import { WidgetShell } from './widget-shell';
import { BudgetConfig, Citation } from '../../core/types/widget.types';
import { SpecialistId } from '../../core/types/agent.types';

interface RenderRow {
  category: string;
  amount: number;
  rationale: string;
  pct: number;
}

@Component({
  selector: 'dea-budget-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    MatProgressBarModule,
    MatTooltipModule,
    CitationChips,
    WidgetShell,
  ],
  templateUrl: './budget-widget.html',
  styleUrl: './budget-widget.scss',
})
export class BudgetWidget {
  readonly widgetId = input.required<SpecialistId>();
  readonly title = input.required<string>();
  readonly config = input.required<BudgetConfig>();
  readonly citations = input<Citation[] | undefined>(undefined);

  protected readonly rows = computed<RenderRow[]>(() => {
    const cfg = this.config();
    const max = Math.max(1, ...cfg.lineItems.map((li) => li.amount));
    return [...cfg.lineItems]
      .sort((a, b) => b.amount - a.amount)
      .map((li) => ({
        category: li.category,
        amount: li.amount,
        rationale: li.rationale,
        pct: Math.round((li.amount / max) * 100),
      }));
  });

  protected readonly subtotal = computed(() =>
    this.config().lineItems.reduce((acc, li) => acc + (li.amount ?? 0), 0),
  );
}
