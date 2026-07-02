import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiKeyDialogService } from '../../core/auth/api-key-dialog.service';

@Component({
  selector: 'dea-no-key-empty-state',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './no-key-empty-state.html',
  styleUrl: './no-key-empty-state.scss',
})
export class NoKeyEmptyState {
  private readonly keyDialog = inject(ApiKeyDialogService);

  protected async open(): Promise<void> {
    await this.keyDialog.open();
  }
}
