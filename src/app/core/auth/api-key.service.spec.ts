import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiKeyService, MODEL_FOR_MODE } from './api-key.service';

const KEY_STORAGE = 'dea.geminiApiKey';
const MODEL_STORAGE = 'dea.geminiModel';

vi.mock('@google/genai', () => {
  class GoogleGenAI {
    readonly models: {
      list: (params?: unknown) => Promise<{ pageLength: number }>;
    };

    constructor(opts: { apiKey?: string }) {
      const apiKey = opts.apiKey?.trim() ?? '';
      this.models = {
        list: async () => {
          if (apiKey === 'GOOD_KEY') return { pageLength: 3 };
          if (apiKey === 'EMPTY_LIST_KEY') return { pageLength: 0 };
          if (apiKey === 'BAD_KEY') {
            throw new Error('API key not valid');
          }
          return { pageLength: 1 };
        },
      };
    }
  }
  return { GoogleGenAI };
});

describe('ApiKeyService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no key when storage is empty', () => {
    const svc = TestBed.inject(ApiKeyService);
    expect(svc.hasKey()).toBe(false);
    expect(svc.key()).toBeNull();
    expect(svc.maskedKey()).toBeNull();
  });

  it('persists a key and exposes a mask of the last 4 chars', () => {
    const svc = TestBed.inject(ApiKeyService);
    svc.setKey('AIzaSyTOPSECRETabcd');
    expect(svc.hasKey()).toBe(true);
    expect(svc.key()).toBe('AIzaSyTOPSECRETabcd');
    expect(svc.maskedKey()).toBe('••••abcd');
    expect(localStorage.getItem(KEY_STORAGE)).toBe('AIzaSyTOPSECRETabcd');
  });

  it('clears the key both in memory and in storage', () => {
    const svc = TestBed.inject(ApiKeyService);
    svc.setKey('AIzaSyTOPSECRETabcd');
    svc.clearKey();
    expect(svc.hasKey()).toBe(false);
    expect(svc.key()).toBeNull();
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
  });

  it('treats an all-whitespace key as a clear', () => {
    const svc = TestBed.inject(ApiKeyService);
    svc.setKey('AIzaSyabcd');
    svc.setKey('   ');
    expect(svc.hasKey()).toBe(false);
  });

  it('defaults the quality mode to fast and maps it to the flash model', () => {
    const svc = TestBed.inject(ApiKeyService);
    expect(svc.mode()).toBe('fast');
    expect(svc.model()).toBe(MODEL_FOR_MODE.fast);
  });

  it('switches to the pro model when quality mode is set', () => {
    const svc = TestBed.inject(ApiKeyService);
    svc.setMode('quality');
    expect(svc.mode()).toBe('quality');
    expect(svc.model()).toBe(MODEL_FOR_MODE.quality);
    expect(localStorage.getItem(MODEL_STORAGE)).toBe('quality');
  });

  it('rehydrates key and mode from localStorage on construction', () => {
    localStorage.setItem(KEY_STORAGE, 'restored-key-1234');
    localStorage.setItem(MODEL_STORAGE, 'quality');
    const svc = TestBed.inject(ApiKeyService);
    expect(svc.key()).toBe('restored-key-1234');
    expect(svc.mode()).toBe('quality');
  });

  it('validate returns ok when models.list returns at least one model', async () => {
    const svc = TestBed.inject(ApiKeyService);
    const result = await svc.validate('GOOD_KEY');
    expect(result).toEqual({ ok: true });
  });

  it('validate fails when models.list returns an empty page', async () => {
    const svc = TestBed.inject(ApiKeyService);
    const result = await svc.validate('EMPTY_LIST_KEY');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/no models/i);
    }
  });

  it('validate fails with a friendly reason when the SDK throws', async () => {
    const svc = TestBed.inject(ApiKeyService);
    const result = await svc.validate('BAD_KEY');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('API key not valid');
    }
  });

  it('validate rejects an empty / whitespace-only candidate', async () => {
    const svc = TestBed.inject(ApiKeyService);
    const result = await svc.validate('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/empty/i);
    }
  });
});
