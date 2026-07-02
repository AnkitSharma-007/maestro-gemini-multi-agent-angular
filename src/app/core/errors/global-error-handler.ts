import { ErrorHandler, inject, Injectable, Injector } from '@angular/core';
import { MissingApiKeyError } from '../types/agent.types';
import { toAppError } from './app-error';
import { NotificationService } from './notification.service';

/**
 * Catches otherwise-unhandled errors, logs the original for developers, and
 * surfaces a sanitized toast to the user. NotificationService is resolved lazily
 * via the Injector because ErrorHandler is instantiated before most providers.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    console.error(error);

    const appError = toAppError(error);
    // These are already handled inline by feature code - don't double-notify.
    if (appError.kind === 'aborted' || error instanceof MissingApiKeyError) return;

    try {
      this.injector.get(NotificationService).errorFrom(appError);
    } catch {
      /* Notifications unavailable (very early failure) - console has the detail. */
    }
  }
}
