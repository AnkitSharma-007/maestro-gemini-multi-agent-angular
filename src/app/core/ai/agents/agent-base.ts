import { inject } from '@angular/core';
import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
  type GroundingChunk,
  type Schema,
} from '@google/genai';
import { usageFromMetadata } from '../gemini-pricing';
import { ApiKeyService } from '../../auth/api-key.service';
import { AgentStore } from '../../state/agent.store';
import {
  AgentId,
  classifyApiError,
  MissingApiKeyError,
} from '../../types/agent.types';
import { Citation } from '../../types/widget.types';

export interface RunStreamedOptions {
  contents: string;
  systemInstruction: string;
  schema: Schema;
  ground?: boolean;
}

export interface RunStreamedResult<T> {
  value: T;
  citations?: Citation[];
}

export abstract class AgentBase {
  protected readonly apiKeys = inject(ApiKeyService);
  protected readonly store = inject(AgentStore);

  abstract readonly id: AgentId;

  private _client: GoogleGenAI | null = null;
  private _clientKey: string | null = null;

  protected lazyClient(): GoogleGenAI {
    const key = this.apiKeys.key();
    if (!key) throw new MissingApiKeyError();
    if (!this._client || this._clientKey !== key) {
      this._client = new GoogleGenAI({ apiKey: key });
      this._clientKey = key;
    }
    return this._client;
  }

  protected async runStreamed<T>(
    opts: RunStreamedOptions,
  ): Promise<RunStreamedResult<T>> {
    this.store.setAgentStatus(this.id, 'thinking');

    let buffer = '';
    const groundingChunks: GroundingChunk[] = [];
    let lastUsage: GenerateContentResponseUsageMetadata | undefined;
    const model = this.apiKeys.model();

    try {
      const stream = await this.lazyClient().models.generateContentStream({
        model,
        contents: opts.contents,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: opts.schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: opts.ground ? [{ googleSearch: {} }] : undefined,
        },
      });

      let firstChunk = true;
      for await (const chunk of stream as AsyncIterable<GenerateContentResponse>) {
        if (firstChunk) {
          this.store.setAgentStatus(this.id, 'streaming');
          firstChunk = false;
        }
        const text = chunk.text;
        if (text) buffer += text;

        if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;

        const md = chunk.candidates?.[0]?.groundingMetadata;
        if (md?.groundingChunks?.length) groundingChunks.push(...md.groundingChunks);
      }

      const usage = usageFromMetadata(lastUsage);
      if (usage) this.store.recordAgentUsage(this.id, usage, model);

      const value = parseJsonResponse<T>(buffer, !!opts.ground);
      const citations = mapCitations(groundingChunks);

      this.store.setAgentStatus(this.id, 'done');
      return { value, citations: citations.length ? citations : undefined };
    } catch (err) {
      const usage = usageFromMetadata(lastUsage);
      if (usage) this.store.recordAgentUsage(this.id, usage, model);
      const message = err instanceof Error ? err.message : String(err);
      this.store.setAgentStatus(this.id, 'error', message);
      (err as { __dea_class?: string }).__dea_class = classifyApiError(err);
      throw err;
    }
  }
}

/**
 * Parse the model's accumulated JSON. Strict first; if `allowTolerant` is set
 * (used for grounded calls, where prose can leak around the JSON), fall back
 * to stripping markdown fences and slicing between the outermost braces.
 */
export function parseJsonResponse<T>(raw: string, allowTolerant: boolean): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch (strictErr) {
    if (!allowTolerant) throw strictErr;

    let cleaned = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      cleaned = cleaned.slice(first, last + 1);
    }
    return JSON.parse(cleaned) as T;
  }
}

export function mapCitations(chunks: readonly GroundingChunk[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of chunks) {
    const web = c.web;
    if (!web?.uri || !web.title) continue;
    if (seen.has(web.uri)) continue;
    seen.add(web.uri);
    out.push({ title: web.title, uri: web.uri });
  }
  return out;
}
