import { computed, effect, Service, signal } from '@angular/core';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'dea.theme';
const LIGHT_CLASS = 'theme-light';

const safeRead = (): ThemeMode | null => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch (e) {
    console.warn('[ThemeService] Could not read theme from localStorage.', e);
    return null;
  }
};

const safeWrite = (mode: ThemeMode): void => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {
    // Non-critical: the theme still applies this session, it just won't persist.
    console.warn('[ThemeService] Could not persist theme to localStorage.', e);
  }
};

const detectInitial = (): ThemeMode => {
  const persisted = safeRead();
  if (persisted) return persisted;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
};

@Service()
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(detectInitial());

  readonly mode = this._mode.asReadonly();
  readonly isDark = computed(() => this._mode() === 'dark');

  constructor() {
    effect(() => {
      if (typeof document === 'undefined') return;
      document.documentElement.classList.toggle(LIGHT_CLASS, this._mode() === 'light');
    });
  }

  private setMode(mode: ThemeMode): void {
    safeWrite(mode);
    this._mode.set(mode);
  }

  toggle(): void {
    this.setMode(this._mode() === 'dark' ? 'light' : 'dark');
  }
}
