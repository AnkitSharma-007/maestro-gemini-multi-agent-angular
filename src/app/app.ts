import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiKeyDialog } from './core/auth/api-key.dialog';
import { ApiKeyService } from './core/auth/api-key.service';
import { AgentStore } from './core/state/agent.store';
import { ThemeService } from './core/theme/theme.service';
import { CommandCenter } from './features/command-center/command-center';
import { NoKeyEmptyState } from './features/command-center/no-key-empty-state';
import { ControlTower } from './features/control-tower/control-tower';
import { AuditRibbon } from './features/audit-ribbon/audit-ribbon';
import { GenerativeRenderer } from './features/renderer/generative-renderer';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    CommandCenter,
    ControlTower,
    AuditRibbon,
    GenerativeRenderer,
    NoKeyEmptyState,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly dialog = inject(MatDialog);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly store = inject(AgentStore);
  private readonly themeService = inject(ThemeService);

  protected readonly hasKey = this.apiKeys.hasKey;
  protected readonly maskedKey = this.apiKeys.maskedKey;
  protected readonly mode = this.apiKeys.mode;
  protected readonly hasContent = this.store.hasContent;
  protected readonly isBusy = this.store.isBusy;
  protected readonly isDark = this.themeService.isDark;

  protected readonly modeLabel = computed(() =>
    this.mode() === 'fast' ? 'Fast' : 'Quality',
  );

  protected openKeyDialog(): void {
    this.dialog.open(ApiKeyDialog, {
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'dea-dialog-panel',
    });
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
