import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiKeyService, QualityMode } from './api-key.service';

@Component({
  selector: 'dea-api-key-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './api-key.dialog.html',
  styleUrl: './api-key.dialog.scss',
})
export class ApiKeyDialog {
  private readonly apiKeys = inject(ApiKeyService);
  private readonly dialogRef = inject(MatDialogRef<ApiKeyDialog>);

  protected readonly draftKey = signal<string>(this.apiKeys.key() ?? '');
  protected readonly mode = signal<QualityMode>(this.apiKeys.mode());
  protected readonly showKey = signal<boolean>(false);
  protected readonly busy = signal<boolean>(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly hasExistingKey = this.apiKeys.hasKey;

  protected readonly studioUrl = 'https://aistudio.google.com/apikey';

  protected toggleVisibility(): void {
    this.showKey.update((v) => !v);
  }

  protected onModeChange(value: QualityMode): void {
    this.mode.set(value);
  }

  protected async onSave(): Promise<void> {
    const candidate = this.draftKey().trim();
    if (!candidate) {
      this.errorMsg.set('Please paste your Gemini API key.');
      return;
    }
    this.busy.set(true);
    this.errorMsg.set(null);
    try {
      const result = await this.apiKeys.validate(candidate);
      if (!result.ok) {
        this.errorMsg.set(result.reason);
        return;
      }
      this.apiKeys.setKey(candidate);
      this.apiKeys.setMode(this.mode());
      this.dialogRef.close({ saved: true });
    } finally {
      this.busy.set(false);
    }
  }

  protected onClear(): void {
    this.apiKeys.clearKey();
    this.draftKey.set('');
    this.errorMsg.set(null);
    this.dialogRef.close({ cleared: true });
  }
}
