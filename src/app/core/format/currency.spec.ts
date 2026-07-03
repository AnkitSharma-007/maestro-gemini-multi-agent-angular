import { describe, expect, it } from 'vitest';
import { safeCurrencyCode } from './currency';

describe('safeCurrencyCode', () => {
  it('passes through valid ISO 4217 codes', () => {
    expect(safeCurrencyCode('USD')).toBe('USD');
    expect(safeCurrencyCode('INR')).toBe('INR');
    expect(safeCurrencyCode('EUR')).toBe('EUR');
  });

  it('uppercases and trims well-formed codes', () => {
    expect(safeCurrencyCode('  inr ')).toBe('INR');
    expect(safeCurrencyCode('usd')).toBe('USD');
  });

  it('falls back for junk, symbols, and wrong-length input', () => {
    expect(safeCurrencyCode('Rs')).toBe('USD');
    expect(safeCurrencyCode('rupees')).toBe('USD');
    expect(safeCurrencyCode('₹')).toBe('USD');
    expect(safeCurrencyCode('')).toBe('USD');
    expect(safeCurrencyCode('   ')).toBe('USD');
  });

  it('falls back for null/undefined', () => {
    expect(safeCurrencyCode(null)).toBe('USD');
    expect(safeCurrencyCode(undefined)).toBe('USD');
  });

  it('honors a custom fallback', () => {
    expect(safeCurrencyCode('nope', 'INR')).toBe('INR');
  });
});
