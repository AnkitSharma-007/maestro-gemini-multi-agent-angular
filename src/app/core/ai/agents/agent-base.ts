import { inject } from '@angular/core';
import type {
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
  GoogleGenAI,
  GroundingChunk,
  Schema,
  ThinkingLevel as SdkThinkingLevel,
} from '@google/genai';
import { loadGenaiSdk } from '../genai-loader';
import { isAbortError, toAppError } from '../../errors/app-error';
import { usageFromMetadata } from '../gemini-pricing';
import { buildRefinePrompt } from '../gemini.prompts';
import { ApiKeyService } from '../../auth/api-key.service';
import { AgentStore } from '../../state/agent.store';
import { AgentId, MissingApiKeyError } from '../../types/agent.types';
import { Citation } from '../../types/widget.types';

const ThinkingLevel = {
  LOW: 'LOW' as SdkThinkingLevel,
} as const;

interface RunStreamedOptions {
  contents: string;
  systemInstruction: string;
  schema: Schema;
  ground?: boolean;
  signal?: AbortSignal;
}

export interface AgentRunResult<T> {
  value: T;
  citations?: Citation[];
}

export abstract class AgentBase {
  protected readonly apiKeys = inject(ApiKeyService);
  protected readonly store = inject(AgentStore);

  abstract readonly id: AgentId;

  private _client: GoogleGenAI | null = null;
  private _clientKey: string | null = null;

  protected async lazyClient(): Promise<GoogleGenAI> {
    const key = this.apiKeys.key();
    if (!key) throw new MissingApiKeyError();
    if (!this._client || this._clientKey !== key) {
      const sdk = await loadGenaiSdk();
      this._client = new sdk.GoogleGenAI({ apiKey: key });
      this._clientKey = key;
    }
    return this._client;
  }

  protected async runStreamed<T>(
    opts: RunStreamedOptions,
  ): Promise<AgentRunResult<T>> {
    this.store.setAgentStatus(this.id, 'thinking');

    let buffer = '';
    const groundingChunks: GroundingChunk[] = [];
    let lastUsage: GenerateContentResponseUsageMetadata | undefined;
    const model = this.apiKeys.model();

    try {
      const client = await this.lazyClient();
      opts.signal?.throwIfAborted();
      const stream = await client.models.generateContentStream({
        model,
        contents: opts.contents,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: opts.schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: opts.ground ? [{ googleSearch: {} }] : undefined,
          abortSignal: opts.signal,
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
      // A cancelled request (a newer run/refine took over, or the key was
      // cleared) is not a real failure. Reset to idle instead of surfacing a
      // spurious "Request cancelled" error shell, and so globalStatus never
      // gets wedged in a busy/error state by benign cancellations.
      if (opts.signal?.aborted || isAbortError(err)) {
        this.store.setAgentStatus(this.id, 'idle');
      } else {
        this.store.setAgentStatus(this.id, 'error', toAppError(err));
      }
      throw err;
    }
  }
}

/** Brief-in / structured-JSON-out shape shared by Budget, Schedule, Venue. */
export abstract class SpecialistAgentBase<T> extends AgentBase {
  protected abstract readonly systemInstruction: string;
  protected abstract readonly schema: Schema;
  protected readonly ground: boolean = false;

  async run(
    brief: string,
    prior?: unknown,
    signal?: AbortSignal,
  ): Promise<AgentRunResult<T>> {
    return this.runStreamed<T>({
      contents: prior ? buildRefinePrompt(prior, brief) : brief,
      systemInstruction: this.systemInstruction,
      schema: this.schema,
      ground: this.ground,
      signal,
    });
  }
}

/** Strict by default; tolerant mode strips ```json fences and carves the outer `{...}` block. */
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
