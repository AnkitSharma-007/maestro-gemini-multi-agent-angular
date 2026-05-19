import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Citation } from '../../core/types/widget.types';

@Component({
  selector: 'dea-citation-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
              rel="noopener"
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
  styles: [
    `
      :host {
        display: block;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        padding-top: 12px;
        border-top: 1px dashed var(--dea-border);
      }
      .label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--dea-fg-muted);
        flex-shrink: 0;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
          color: var(--dea-success);
        }
      }
      mat-chip-set {
        flex: 1;
      }
      a[mat-chip] {
        text-decoration: none;
        font-size: 12px;
        cursor: pointer;
        background: var(--dea-bg-elev-2);
      }
      mat-icon[matChipTrailingIcon] {
        font-size: 13px;
        width: 13px;
        height: 13px;
      }
    `,
  ],
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
