import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ApiKeyService } from '../../core/auth/api-key.service';
import { AgentStore } from '../../core/state/agent.store';
import { PromptDraftService } from '../../core/state/prompt-draft.service';
import { AuditRibbon } from '../../features/audit-ribbon/audit-ribbon';
import { CommandCenter } from '../../features/command-center/command-center';
import { NoKeyEmptyState } from '../../features/command-center/no-key-empty-state';
import { ControlTower } from '../../features/control-tower/control-tower';
import { GenerativeRenderer } from '../../features/renderer/generative-renderer';

@Component({
  selector: 'dea-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    CommandCenter,
    ControlTower,
    AuditRibbon,
    GenerativeRenderer,
    NoKeyEmptyState,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly apiKeys = inject(ApiKeyService);
  private readonly store = inject(AgentStore);
  private readonly drafts = inject(PromptDraftService);
  private readonly route = inject(ActivatedRoute);

  protected readonly hasKey = this.apiKeys.hasKey;
  protected readonly hasContent = this.store.hasContent;
  protected readonly isBusy = this.store.isBusy;

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  constructor() {
    effect(() => {
      const tryPrompt = this.queryParams().get('try');
      if (tryPrompt) this.drafts.set(tryPrompt);
    });
  }
}
