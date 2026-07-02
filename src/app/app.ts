import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiKeyDialogService } from './core/auth/api-key-dialog.service';
import { ApiKeyService } from './core/auth/api-key.service';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly keyDialog = inject(ApiKeyDialogService);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly themeService = inject(ThemeService);

  protected readonly hasKey = this.apiKeys.hasKey;
  protected readonly maskedKey = this.apiKeys.maskedKey;
  protected readonly mode = this.apiKeys.mode;
  protected readonly isDark = this.themeService.isDark;

  protected readonly modeLabel = computed(() =>
    this.mode() === 'fast' ? 'Fast' : 'Quality',
  );

  protected async openKeyDialog(): Promise<void> {
    await this.keyDialog.open();
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
