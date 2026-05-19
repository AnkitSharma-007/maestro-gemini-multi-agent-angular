import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SPECIALIST_IDS } from '../../core/types/agent.types';
import { WidgetSlot } from './widget-slot';

@Component({
  selector: 'dea-generative-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetSlot],
  template: `
    <section class="grid" aria-label="Generated event dashboard">
      @for (id of slotIds; track id) {
        <dea-widget-slot [slotId]="id" />
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
        gap: 20px;
        align-items: stretch;
      }

      dea-widget-slot {
        display: block;
        min-width: 0;
        min-height: 320px;
      }

      @media (max-width: 720px) {
        .grid {
          gap: 14px;
        }

        dea-widget-slot {
          min-height: 280px;
        }
      }
    `,
  ],
})
export class GenerativeRenderer {
  readonly slotIds = SPECIALIST_IDS;
}
