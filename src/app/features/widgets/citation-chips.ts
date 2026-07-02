import { Component, computed, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Citation } from '../../core/types/widget.types';

@Component({
  selector: 'dea-citation-chips',
  imports: [MatChipsModule, MatIconModule, MatTooltipModule],
  template: `
    @if (visibleChips().length > 0) {
      <div class="row">
        <span class="label">
          <mat-icon aria-hidden="true">verified</mat-icon>
          Sources
        </span>
        <mat-chip-set>
          @for (c of visibleChips(); track c.uri) {
            <a
              mat-chip
              [href]="c.uri"
              target="_blank"
              rel="noopener noreferrer"
              [matTooltip]="c.title"
              matTooltipPosition="above"
            >
              {{ shorten(c.title) }}
              <mat-icon matChipTrailingIcon>open_in_new</mat-icon>
            </a>
          }
        </mat-chip-set>
      </div>
    }
  `,
  styleUrl: './citation-chips.scss',
})
export class CitationChips {
  readonly citations = input<Citation[] | undefined>(undefined);
  readonly maxChips = input<number>(4);

  protected readonly visibleChips = computed<Citation[]>(() =>
    (this.citations() ?? []).slice(0, this.maxChips()),
  );

  protected shorten(title: string): string {
    return title.length > 38 ? `${title.slice(0, 36)}…` : title;
  }
}
