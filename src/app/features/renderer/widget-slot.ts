import {
  Component,
  ComponentRef,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  Type,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { SpecialistId } from '../../core/types/agent.types';
import { WidgetEntry } from '../../core/types/widget.types';
import { WidgetShell } from '../widgets/widget-shell';
import { loadWidget } from './widget-registry';

type SlotMode = 'ghost' | 'real' | 'error';

@Component({
  selector: 'dea-widget-slot',
  imports: [WidgetShell],
  template: `
    @if (mode() === 'real') {
      <ng-container #anchor></ng-container>
    } @else {
      <dea-widget-shell [mode]="mode()" [widgetId]="slotId()" />
    }
  `,
  styleUrl: './widget-slot.scss',
})
export class WidgetSlot {
  private readonly store = inject(AgentStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly slotId = input.required<SpecialistId>();

  @ViewChild('anchor', { read: ViewContainerRef })
  private anchor?: ViewContainerRef;

  private componentRef: ComponentRef<unknown> | null = null;
  private componentType: Type<unknown> | null = null;
  private loadInFlight: Promise<void> | null = null;
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
    this.destroyRef.onDestroy(() => this.destroyInstance());

    effect(() => {
      const w = this.widget();
      const id = this.slotId();
      if (!w) {
        this.destroyInstance();
        this.lastSeenGeneration = 0;
        return;
      }

      if (!this.anchor) {
        queueMicrotask(() => this.materialiseOrUpdate(id, w));
        return;
      }
      this.materialiseOrUpdate(id, w);
    });

    effect(() => {
      this.store.staleWidgets();
      if (this.widget() && this.componentRef) {
        this.componentRef.changeDetectorRef.markForCheck();
      }
    });
  }

  private materialiseOrUpdate(id: SpecialistId, w: WidgetEntry): void {
    if (!this.anchor) return;

    if (this.componentRef && this.componentType) {
      this.applyInputs(this.componentRef, id, w);
      return;
    }

    if (this.loadInFlight) return;

    this.loadInFlight = (async () => {
      try {
        const componentType = await loadWidget(id);
        if (!this.anchor) return;
        const current = this.widget();
        if (!current) return;

        this.componentType = componentType;
        this.componentRef = this.anchor.createComponent(componentType);
        this.applyInputs(this.componentRef, id, current);
      } finally {
        this.loadInFlight = null;
      }
    })();
  }

  private applyInputs(
    ref: ComponentRef<unknown>,
    id: SpecialistId,
    w: WidgetEntry,
  ): void {
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
    }
    if (this.anchor) {
      this.anchor.clear();
    }
  }
}
