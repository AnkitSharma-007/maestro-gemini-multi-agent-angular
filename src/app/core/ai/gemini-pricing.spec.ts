import { describe, expect, it } from 'vitest';
import { estimateCostUsd, usageFromMetadata } from './gemini-pricing';

describe('usageFromMetadata', () => {
  it('maps Gemini usage fields to TokenUsage', () => {
    const usage = usageFromMetadata({
      promptTokenCount: 1000,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 50,
      totalTokenCount: 1250,
    });
    expect(usage).toEqual({
      promptTokens: 1000,
      outputTokens: 250,
      totalTokens: 1250,
    });
  });

  it('returns null when no counts are present', () => {
    expect(usageFromMetadata({})).toBeNull();
  });
});

describe('estimateCostUsd', () => {
  it('applies flash preview rates', () => {
    const cost = estimateCostUsd('gemini-3-flash-preview', {
      promptTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    expect(cost).toBeCloseTo(3.5, 5);
  });
});
