import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroundingChunk, Schema } from '@google/genai';
import { mapCitations, parseJsonResponse, SpecialistAgentBase } from './agent-base';
import { AgentStore } from '../../state/agent.store';
import { ApiKeyService } from '../../auth/api-key.service';

// loadGenaiSdk() dynamically imports this package; mock the non-relative import
// so the Angular unit-test runner allows it (relative mocks are unsupported).
const { generateContentStream } = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContentStream };
  },
}));

describe('parseJsonResponse', () => {
  it('parses well-formed JSON in strict mode', () => {
    const result = parseJsonResponse<{ name: string }>(
      '{"name":"Maestro"}',
      false,
    );
    expect(result).toEqual({ name: 'Maestro' });
  });

  it('trims surrounding whitespace before parsing', () => {
    const result = parseJsonResponse<{ ok: boolean }>(
      '   \n  {"ok": true}   \n  ',
      false,
    );
    expect(result).toEqual({ ok: true });
  });

  it('throws in strict mode when the response is wrapped in prose', () => {
    expect(() =>
      parseJsonResponse<unknown>('Sure! Here you go: {"x": 1}', false),
    ).toThrowError();
  });

  it('strips ```json fences when tolerant mode is on', () => {
    const result = parseJsonResponse<{ x: number }>(
      '```json\n{"x": 42}\n```',
      true,
    );
    expect(result).toEqual({ x: 42 });
  });

  it('strips plain triple-backtick fences when tolerant', () => {
    const result = parseJsonResponse<{ x: number }>(
      '```\n{"x": 7}\n```',
      true,
    );
    expect(result).toEqual({ x: 7 });
  });

  it('carves the outermost object from leading/trailing prose when tolerant', () => {
    const raw =
      'Here is the answer based on my search:\n{"name":"Acme","capacity":1200}\nLet me know if you need more.';
    const result = parseJsonResponse<{ name: string; capacity: number }>(
      raw,
      true,
    );
    expect(result).toEqual({ name: 'Acme', capacity: 1200 });
  });

  it('rethrows when tolerant cleanup still leaves invalid JSON', () => {
    expect(() => parseJsonResponse<unknown>('not even a json-ish thing', true)).toThrowError();
  });
});

describe('mapCitations', () => {
  it('returns an empty array for an empty input', () => {
    expect(mapCitations([])).toEqual([]);
  });

  it('extracts title and uri from web grounding chunks', () => {
    const chunks: GroundingChunk[] = [
      { web: { uri: 'https://a.example', title: 'Source A' } },
      { web: { uri: 'https://b.example', title: 'Source B' } },
    ];
    expect(mapCitations(chunks)).toEqual([
      { title: 'Source A', uri: 'https://a.example' },
      { title: 'Source B', uri: 'https://b.example' },
    ]);
  });

  it('deduplicates by uri (first occurrence wins)', () => {
    const chunks: GroundingChunk[] = [
      { web: { uri: 'https://dup.example', title: 'Original' } },
      { web: { uri: 'https://dup.example', title: 'Duplicate' } },
      { web: { uri: 'https://other.example', title: 'Other' } },
    ];
    const result = mapCitations(chunks);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ title: 'Original', uri: 'https://dup.example' });
    expect(result[1]).toEqual({ title: 'Other', uri: 'https://other.example' });
  });

  it('skips chunks missing a uri or title', () => {
    const chunks: GroundingChunk[] = [
      { web: { uri: 'https://nourl.example' } },
      { web: { title: 'Title only' } },
      {},
      { web: { uri: 'https://good.example', title: 'Good' } },
    ];
    expect(mapCitations(chunks)).toEqual([
      { title: 'Good', uri: 'https://good.example' },
    ]);
  });
});

class CancelTestAgent extends SpecialistAgentBase<{ ok: boolean }> {
  readonly id = 'budget' as const;
  protected readonly systemInstruction = 'sys';
  protected readonly schema = { type: 'OBJECT' } as unknown as Schema;
}

describe('runStreamed cancellation handling', () => {
  let store: AgentStore;
  let agent: CancelTestAgent;

  beforeEach(() => {
    generateContentStream.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        CancelTestAgent,
        {
          provide: ApiKeyService,
          useValue: {
            key: signal('test-key'),
            model: () => 'gemini-3.5-flash',
          } as unknown as ApiKeyService,
        },
      ],
    });
    store = TestBed.inject(AgentStore);
    agent = TestBed.inject(CancelTestAgent);
  });

  it('resets to idle (not error) when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(agent.run('brief', undefined, controller.signal)).rejects.toBeDefined();

    expect(store.agentStates().budget.status).toBe('idle');
    expect(store.agentStates().budget.error).toBeUndefined();
    // We bail before touching the network on an already-aborted request.
    expect(generateContentStream).not.toHaveBeenCalled();
  });

  it('resets to idle when the SDK rejects with an AbortError', async () => {
    generateContentStream.mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );

    await expect(agent.run('brief')).rejects.toBeDefined();

    expect(store.agentStates().budget.status).toBe('idle');
    expect(store.agentStates().budget.error).toBeUndefined();
  });

  it('surfaces a real (non-abort) failure as an error state', async () => {
    generateContentStream.mockRejectedValue(
      new Error('got status: 500 Internal Server Error'),
    );

    await expect(agent.run('brief')).rejects.toBeDefined();

    const state = store.agentStates().budget;
    expect(state.status).toBe('error');
    expect(state.error).toBeTruthy();
  });
});
