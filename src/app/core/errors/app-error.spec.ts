import { describe, expect, it } from 'vitest';
import { extractGeminiErrorMessage, toAppError } from './app-error';
import { MissingApiKeyError } from '../types/agent.types';

describe('extractGeminiErrorMessage', () => {
  it('pulls the human-readable message out of a Gemini JSON body', () => {
    const raw =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}';
    expect(extractGeminiErrorMessage(raw)).toBe('Quota exceeded');
  });

  it('returns the trimmed input when there is no JSON payload', () => {
    expect(extractGeminiErrorMessage('  plain failure  ')).toBe('plain failure');
  });

  it('falls back to the raw text when the JSON is malformed', () => {
    const raw = 'boom {not-json';
    expect(extractGeminiErrorMessage(raw)).toBe(raw);
  });
});

describe('toAppError', () => {
  it('maps a missing API key to a non-retryable auth error', () => {
    const err = toAppError(new MissingApiKeyError());
    expect(err.kind).toBe('auth');
    expect(err.retryable).toBe(false);
    expect(err.title).toBeTruthy();
    expect(err.message).toBeTruthy();
  });

  it('classifies 404 / model errors as invalid-model', () => {
    const err = toAppError(
      new Error('got status: 404 Not Found. models/gemini-x is not found for API version v1beta'),
    );
    expect(err.kind).toBe('invalid-model');
    expect(err.retryable).toBe(false);
  });

  it('classifies quota / rate-limit errors as retryable quota', () => {
    const err = toAppError(new Error('429 RESOURCE_EXHAUSTED: Quota exceeded'));
    expect(err.kind).toBe('quota');
    expect(err.retryable).toBe(true);
  });

  it('classifies network failures as retryable network', () => {
    const err = toAppError(new Error('fetch error: ECONNREFUSED'));
    expect(err.kind).toBe('network');
    expect(err.retryable).toBe(true);
  });

  it('classifies aborted requests distinctly', () => {
    const err = toAppError(new Error('The operation was aborted'));
    expect(err.kind).toBe('aborted');
  });

  it('falls back to unknown for unrecognised errors', () => {
    const err = toAppError(new Error('something entirely unexpected'));
    expect(err.kind).toBe('unknown');
    expect(err.retryable).toBe(true);
  });

  it('keeps the raw text as detail when it differs from the friendly copy', () => {
    const err = toAppError(new Error('403 permission denied for this project'));
    expect(err.kind).toBe('auth');
    expect(err.detail).toContain('permission denied');
  });
});
