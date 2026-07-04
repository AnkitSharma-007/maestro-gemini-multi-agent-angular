import { Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ApiKeyService } from '../../core/auth/api-key.service';
import { DemoModeService } from '../../core/demo/demo-mode.service';
import { AgentStore } from '../../core/state/agent.store';
import { PromptDraftService } from '../../core/state/prompt-draft.service';
import { AuditRibbon } from '../../features/audit-ribbon/audit-ribbon';
import { CommandCenter } from '../../features/command-center/command-center';
import { NoKeyEmptyState } from '../../features/command-center/no-key-empty-state';
import { ControlTower } from '../../features/control-tower/control-tower';
import { DemoBanner } from '../../features/demo/demo-banner';
import { GenerativeRenderer } from '../../features/renderer/generative-renderer';

@Component({
  selector: 'dea-workspace-page',
  imports: [
    MatIconModule,
    CommandCenter,
    ControlTower,
    AuditRibbon,
    GenerativeRenderer,
    NoKeyEmptyState,
    DemoBanner,
  ],
  templateUrl: './workspace.page.html',
  styleUrl: './workspace.page.scss',
})
export class WorkspacePage {
  private readonly apiKeys = inject(ApiKeyService);
  private readonly store = inject(AgentStore);
  private readonly drafts = inject(PromptDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly demo = inject(DemoModeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly hasKey = this.apiKeys.hasKey;
  protected readonly hasContent = this.store.hasContent;
  protected readonly isBusy = this.store.isBusy;
  protected readonly demoActive = this.demo.active;

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  constructor() {
    effect(() => {
      const params = this.queryParams();

      // React only to the URL: reading `active` untracked keeps an Exit/convert
      // (which flips `active` off while `?demo=1` lingers) from restarting the demo.
      // `?demo=1` launches the keyless sample run and wins over `?try=`.
      if (params.get('demo') === '1') {
        if (!untracked(() => this.demo.active())) this.demo.start();
        return;
      }

      const tryPrompt = params.get('try');
      if (tryPrompt) this.drafts.set(tryPrompt);
    });

    // Leaving the workspace exits the demo so a scripted run never outlives the page.
    this.destroyRef.onDestroy(() => {
      if (this.demo.active()) this.demo.stop();
    });
  }
}
