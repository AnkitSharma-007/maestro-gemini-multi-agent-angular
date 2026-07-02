import { Component } from '@angular/core';
import { SPECIALIST_IDS } from '../../core/types/agent.types';
import { WidgetSlot } from './widget-slot';

@Component({
  selector: 'dea-generative-renderer',
  imports: [WidgetSlot],
  template: `
    <section class="grid" aria-label="Generated event dashboard">
      @for (id of slotIds; track id) {
        <dea-widget-slot [slotId]="id" />
      }
    </section>
  `,
  styleUrl: './generative-renderer.scss',
})
export class GenerativeRenderer {
  readonly slotIds = SPECIALIST_IDS;
}
