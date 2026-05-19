import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { SpecialistId } from '../../core/types/agent.types';
import { WidgetEntry } from '../../core/types/widget.types';
import { WidgetShell } from '../widgets/widget-shell';
import { WIDGET_REGISTRY } from './widget-registry';

type SlotMode = 'ghost' | 'real' | 'error';

@Component({
  selector: 'dea-widget-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetShell],
  template: `
    @if (mode() === 'real') {
      <ng-container #anchor></ng-container>
    } @else {
      <dea-widget-shell [mode]="mode()" [widgetId]="slotId()" />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class WidgetSlot implements OnDestroy {
  private readonly store = inject(AgentStore);

  readonly slotId = input.required<SpecialistId>();

  @ViewChild('anchor', { read: ViewContainerRef })
  private anchor?: ViewContainerRef;

  private componentRef: ComponentRef<unknown> | null = null;
  private currentSlotComponentType: unknown = null;
  private lastSeenGeneration = 0;

  protected readonly widget = computed<WidgetEntry | undefined>(
    () => this.store.widgets()[this.slotId()],
  );

  protected readonly mode = computed<SlotMode>(() => {
    if (this.widget()) return 'real';
    if (this.store.agentStates()[this.slotId()].status === 'error') return 'error';
    return 'ghost';
  });

  constructor() {
    effect(() => {
      const w = this.widget();
      const id = this.slotId();
      if (!w) {
        this.destroyInstance();
        this.lastSeenGeneration = 0;
        return;
      }

      // Anchor only exists once @if has rendered; defer one tick if needed.
      if (!this.anchor) {
        queueMicrotask(() => this.materialiseOrUpdate(id, w));
        return;
      }
      this.materialiseOrUpdate(id, w);
    });

    effect(() => {
      const id = this.slotId();
      this.store.staleWidgets();
      if (this.widget() && this.componentRef) {
        this.componentRef.changeDetectorRef.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyInstance();
  }

  private materialiseOrUpdate(id: SpecialistId, w: WidgetEntry): void {
    if (!this.anchor) return;

    const expectedType = WIDGET_REGISTRY[id];
    if (!this.componentRef || this.currentSlotComponentType !== expectedType) {
      this.destroyInstance();
      this.componentRef = this.anchor.createComponent(expectedType);
      this.currentSlotComponentType = expectedType;
    }

    const ref = this.componentRef!;
    ref.setInput('widgetId', id);
    ref.setInput('title', w.payload.title);
    ref.setInput('config', w.payload.config);
    ref.setInput('citations', w.citations);

    if (w.generation !== this.lastSeenGeneration) {
      ref.changeDetectorRef.markForCheck();
      this.lastSeenGeneration = w.generation;
    }
  }

  private destroyInstance(): void {
    if (this.componentRef) {
      this.componentRef.destroy();
      this.componentRef = null;
      this.currentSlotComponentType = null;
    }
    if (this.anchor) {
      this.anchor.clear();
    }
  }
}
