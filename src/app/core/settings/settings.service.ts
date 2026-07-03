import { Service, signal } from '@angular/core';

const AUTO_HEAL_KEY = 'dea.autoHeal';

const safeReadBool = (key: string, fallback: boolean): boolean => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch (e) {
    console.warn('[SettingsService] Could not read setting from localStorage.', e);
    return fallback;
  }
};

const safeWriteBool = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    // Non-critical: the setting still applies this session, it just won't persist.
    console.warn('[SettingsService] Could not persist setting to localStorage.', e);
  }
};

/** User-tunable, persisted app preferences (BYOK-friendly, all client-side). */
@Service()
export class SettingsService {
  /**
   * When on, the orchestrator auto-repairs low-confidence widgets after a run
   * (extra Gemini calls on the user's key). Opt-out lives here so the spend is
   * consensual; default on for the out-of-the-box demo experience.
   */
  private readonly _autoHeal = signal<boolean>(safeReadBool(AUTO_HEAL_KEY, true));
  readonly autoHeal = this._autoHeal.asReadonly();

  setAutoHeal(enabled: boolean): void {
    safeWriteBool(AUTO_HEAL_KEY, enabled);
    this._autoHeal.set(enabled);
  }

  toggleAutoHeal(): void {
    this.setAutoHeal(!this._autoHeal());
  }
}
