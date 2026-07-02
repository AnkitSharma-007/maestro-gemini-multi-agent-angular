import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import type { TokenUsage } from '../types/telemetry.types';

/** USD per 1M tokens. Estimates only — preview prices may drift. */
interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Paid-tier list prices, keyed by the model IDs this app actually requests
 * (see MODEL_FOR_MODE). Pro rates use the <=200k-token tier; prompts over
 * 200k tokens are billed higher ($4 / $18) but the app does not model that.
 * @see https://ai.google.dev/gemini-api/docs/pricing
 */
const MODEL_PRICING_USD: Record<string, ModelPricing> = {
  'gemini-3.5-flash': { inputPerMillion: 1.5, outputPerMillion: 9.0 },
  'gemini-3.1-pro-preview': { inputPerMillion: 2.0, outputPerMillion: 12.0 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 0.5, outputPerMillion: 3.0 };

function pricingForModel(model: string): ModelPricing {
  return MODEL_PRICING_USD[model] ?? DEFAULT_PRICING;
}

export function usageFromMetadata(
  md: GenerateContentResponseUsageMetadata | undefined,
): TokenUsage | null {
  if (!md) return null;
  const prompt = md.promptTokenCount ?? 0;
  const output =
    (md.candidatesTokenCount ?? 0) +
    (md.thoughtsTokenCount ?? 0) +
    (md.toolUsePromptTokenCount ?? 0);
  const total = md.totalTokenCount ?? prompt + output;
  if (total <= 0 && prompt <= 0 && output <= 0) return null;
  return { promptTokens: prompt, outputTokens: output, totalTokens: total };
}

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const rates = pricingForModel(model);
  const inputCost = (usage.promptTokens / 1_000_000) * rates.inputPerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * rates.outputPerMillion;
  return inputCost + outputCost;
}
