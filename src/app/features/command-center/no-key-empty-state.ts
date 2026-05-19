import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ApiKeyDialog } from '../../core/auth/api-key.dialog';

@Component({
  selector: 'dea-no-key-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './no-key-empty-state.html',
  styleUrl: './no-key-empty-state.scss',
})
export class NoKeyEmptyState {
  private readonly dialog = inject(MatDialog);

  protected open(): void {
    this.dialog.open(ApiKeyDialog, {
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'dea-dialog-panel',
    });
  }
}
