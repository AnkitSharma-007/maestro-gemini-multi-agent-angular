import { computed, inject, Service, signal } from '@angular/core';
import { loadGenaiSdk } from '../ai/genai-loader';
import { extractGeminiErrorMessage } from '../errors/app-error';
import { NotificationService } from '../errors/notification.service';

const KEY_STORAGE = 'dea.geminiApiKey';
const MODEL_STORAGE = 'dea.geminiModel';

export type QualityMode = 'fast' | 'quality';

export const MODEL_FOR_MODE: Record<QualityMode, string> = {
  fast: 'gemini-3.5-flash',
  quality: 'gemini-3.1-pro-preview',
};

type ValidateResult = { ok: true } | { ok: false; reason: string };

const isQualityMode = (v: unknown): v is QualityMode => v === 'fast' || v === 'quality';

const safeRead = (storageKey: string): string | null => {
  try {
    return localStorage.getItem(storageKey);
  } catch (e) {
    console.warn(`[ApiKeyService] Could not read "${storageKey}" from localStorage.`, e);
    return null;
  }
};

/** Best-effort persist. Returns false when storage is unavailable (e.g. private mode). */
const safeWrite = (storageKey: string, value: string): boolean => {
  try {
    localStorage.setItem(storageKey, value);
    return true;
  } catch (e) {
    console.warn(`[ApiKeyService] Could not persist "${storageKey}" to localStorage.`, e);
    return false;
  }
};

const safeRemove = (storageKey: string): void => {
  try {
    localStorage.removeItem(storageKey);
  } catch (e) {
    console.warn(`[ApiKeyService] Could not remove "${storageKey}" from localStorage.`, e);
  }
};

@Service()
export class ApiKeyService {
  private readonly notifications = inject(NotificationService);

  private readonly _key = signal<string | null>(safeRead(KEY_STORAGE));
  private readonly _mode = signal<QualityMode>(
    isQualityMode(safeRead(MODEL_STORAGE)) ? (safeRead(MODEL_STORAGE) as QualityMode) : 'fast',
  );

  readonly key = this._key.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly hasKey = computed(() => !!this._key()?.trim());
  readonly model = computed(() => MODEL_FOR_MODE[this._mode()]);

  readonly maskedKey = computed(() => {
    const k = this._key();
    if (!k) return null;
    return `••••${k.slice(-4)}`;
  });

  setKey(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      this.clearKey();
      return;
    }
    const persisted = safeWrite(KEY_STORAGE, trimmed);
    this._key.set(trimmed);
    if (!persisted) {
      this.notifications.warn(
        "Your API key is active for this session but couldn't be saved. You may need to re-enter it after reloading.",
      );
    }
  }

  clearKey(): void {
    safeRemove(KEY_STORAGE);
    this._key.set(null);
  }

  setMode(mode: QualityMode): void {
    safeWrite(MODEL_STORAGE, mode);
    this._mode.set(mode);
  }

  /**
   * Validate a candidate key by calling `models.list` with pageSize=1. Cheap —
   * no token spend on generation — and confirms the key can reach the API.
   */
  async validate(candidate: string): Promise<ValidateResult> {
    const trimmed = candidate.trim();
    if (!trimmed) return { ok: false, reason: 'API key is empty.' };
    try {
      const sdk = await loadGenaiSdk();
      const ai = new sdk.GoogleGenAI({ apiKey: trimmed });
      const pager = await ai.models.list({ config: { pageSize: 1 } });
      if (pager.pageLength === 0) {
        return { ok: false, reason: 'No models returned for this key.' };
      }
      return { ok: true };
    } catch (e: unknown) {
      const raw = e instanceof Error && e.message ? e.message : 'Could not validate this API key.';
      return { ok: false, reason: extractGeminiErrorMessage(raw) };
    }
  }
}
