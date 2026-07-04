import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiKeyService } from '../../core/auth/api-key.service';
import { ApiKeyDialogService } from '../../core/auth/api-key-dialog.service';
import { DemoModeService } from '../../core/demo/demo-mode.service';

/**
 * Persistent bar shown while the workspace is in keyless demo mode. It reassures
 * the visitor that nothing is being sent to Gemini and offers the sanctioned
 * conversion path (connect a key → run for real), plus Replay / Exit.
 */
@Component({
  selector: 'dea-demo-banner',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './demo-banner.html',
  styleUrl: './demo-banner.scss',
})
export class DemoBanner {
  private readonly demo = inject(DemoModeService);
  private readonly keyDialog = inject(ApiKeyDialogService);
  private readonly apiKeys = inject(ApiKeyService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly phase = this.demo.phase;

  protected replay(): void {
    this.demo.replay();
  }

  protected exit(): void {
    this.demo.stop();
    // With a key, the now-empty real workspace is useful — just drop the demo
    // param. Without one, `/architect` would only show the no-key empty state,
    // so return to the richer landing page the visitor came from.
    if (this.apiKeys.hasKey()) {
      this.clearDemoParam();
    } else {
      void this.router.navigateByUrl('/');
    }
  }

  protected async connect(): Promise<void> {
    const ref = await this.keyDialog.open();
    ref.afterClosed().subscribe(() => {
      // Only leave the demo if a key was actually connected; a cancelled dialog
      // keeps the sample run playing. Keep the sample brief prefilled so the
      // visitor can run it for real with one click.
      if (this.apiKeys.hasKey()) {
        this.demo.stop({ keepBrief: true });
        this.clearDemoParam();
      }
    });
  }

  /** Drop `?demo=1` so a refresh (esp. after connecting a key) won't relaunch it. */
  private clearDemoParam(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { demo: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
