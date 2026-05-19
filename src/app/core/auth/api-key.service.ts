import { computed, Injectable, signal } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

const KEY_STORAGE = 'dea.geminiApiKey';
const MODEL_STORAGE = 'dea.geminiModel';

export type QualityMode = 'fast' | 'quality';

export const MODEL_FOR_MODE: Record<QualityMode, string> = {
  fast: 'gemini-3-flash-preview',
  quality: 'gemini-3-pro-preview',
};

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: string };

const isQualityMode = (v: unknown): v is QualityMode =>
  v === 'fast' || v === 'quality';

const safeRead = (storageKey: string): string | null => {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

const safeWrite = (storageKey: string, value: string): void => {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* ignore */
  }
};

const safeRemove = (storageKey: string): void => {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
};

/**
 * Gemini's SDK rethrows the raw HTTP body as the Error message, so for a 400
 * we get a wall of JSON like `got status: 400 Bad Request. {"error":{...}}`.
 * Pull out the human-readable `error.message` so we can surface a single
 * readable line in the dialog.
 */
const extractGeminiErrorMessage = (raw: string): string => {
  const fallback = raw.trim();
  const start = fallback.indexOf('{');
  if (start < 0) return fallback;
  try {
    const parsed = JSON.parse(fallback.slice(start)) as {
      error?: { message?: string; status?: string };
    };
    const inner = parsed?.error?.message?.trim();
    if (inner) return inner;
  } catch {
    /* not JSON — fall through */
  }
  return fallback;
};

@Injectable({ providedIn: 'root' })
export class ApiKeyService {
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
    safeWrite(KEY_STORAGE, trimmed);
    this._key.set(trimmed);
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
      const ai = new GoogleGenAI({ apiKey: trimmed });
      const pager = await ai.models.list({ config: { pageSize: 1 } });
      if (pager.pageLength === 0) {
        return { ok: false, reason: 'No models returned for this key.' };
      }
      return { ok: true };
    } catch (e: unknown) {
      const raw =
        e instanceof Error && e.message
          ? e.message
          : 'Could not validate this API key.';
      return { ok: false, reason: extractGeminiErrorMessage(raw) };
    }
  }
}
