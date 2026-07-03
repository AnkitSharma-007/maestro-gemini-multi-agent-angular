import { Service, signal } from '@angular/core';

/**
 * Carrier signal that lets the Guide page (or any other navigator) seed the
 * Command Center's prompt textarea via `?try=...` query params without tightly
 * coupling the pages.
 */
@Service()
export class PromptDraftService {
  readonly draft = signal<string>('');

  set(value: string): void {
    this.draft.set(value);
  }

  consume(): string {
    const value = this.draft();
    if (value) this.draft.set('');
    return value;
  }
}
