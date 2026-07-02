import { inject, Service } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { AppError } from './app-error';

type NotifyKind = 'error' | 'warn' | 'success' | 'info';

/** Centralized toast/snackbar surface. Wraps MatSnackBar with consistent styling. */
@Service()
export class NotificationService {
  private readonly snack = inject(MatSnackBar);

  error(message: string): void {
    this.open(message, 'error');
  }

  warn(message: string): void {
    this.open(message, 'warn');
  }

  success(message: string): void {
    this.open(message, 'success');
  }

  info(message: string): void {
    this.open(message, 'info');
  }

  /** Shows a sanitized AppError as a single-line toast. */
  errorFrom(err: AppError): void {
    this.open(`${err.title}: ${err.message}`, 'error');
  }

  private open(message: string, kind: NotifyKind): void {
    this.snack.open(message, 'Dismiss', {
      duration: kind === 'error' ? 8000 : 5000,
      panelClass: [`dea-snack-${kind}`],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
