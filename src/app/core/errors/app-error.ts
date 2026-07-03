import { classifyApiError, MissingApiKeyError } from '../types/agent.types';

export type AppErrorKind =
  | 'auth'
  | 'quota'
  | 'network'
  | 'invalid-model'
  | 'parse'
  | 'aborted'
  | 'unknown';

/**
 * A sanitized, user-facing error. `title`/`message` are safe to render directly;
 * `detail` holds the raw technical text for tooltips/expanders only.
 */
export interface AppError {
  kind: AppErrorKind;
  title: string;
  message: string;
  detail?: string;
  retryable: boolean;
}

/**
 * Gemini's SDK rethrows the raw HTTP body as the Error message, so a failure
 * arrives as a wall of JSON like `got status: 400 Bad Request. {"error":{...}}`.
 * Pull out the human-readable `error.message` so we can surface a single line.
 */
export function extractGeminiErrorMessage(raw: string): string {
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
    /* not JSON - fall through */
  }
  return fallback;
}

const COPY: Record<AppErrorKind, Omit<AppError, 'kind' | 'detail'>> = {
  auth: {
    title: 'API key problem',
    message:
      'Your Gemini API key is missing or was rejected. Open \u201CConnect key\u201D to add or update it.',
    retryable: false,
  },
  quota: {
    title: 'Rate limit reached',
    message:
      "You've hit Gemini's rate limit or quota. Wait a moment and try again, or check your plan.",
    retryable: true,
  },
  network: {
    title: 'Connection problem',
    message: "Couldn't reach Gemini. Check your internet connection and try again.",
    retryable: true,
  },
  'invalid-model': {
    title: 'Model unavailable',
    message:
      "The selected Gemini model isn't available for your key. Try switching quality mode or updating your key.",
    retryable: false,
  },
  parse: {
    title: 'Unexpected response',
    message: "Gemini returned a response we couldn't read. Retrying usually fixes this.",
    retryable: true,
  },
  aborted: {
    title: 'Request cancelled',
    message: 'The request was cancelled.',
    retryable: true,
  },
  unknown: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
    retryable: true,
  },
};

export function isAbortError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (err instanceof Error && err.name === 'AbortError') return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('aborted') || msg.includes('abortsignal');
}

function classifyKind(err: unknown): AppErrorKind {
  if (err instanceof MissingApiKeyError) return 'auth';
  if (isAbortError(err)) return 'aborted';

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('404') || msg.includes('not found') || msg.includes('models/')) {
    return 'invalid-model';
  }
  if (msg.includes('json') && (msg.includes('parse') || msg.includes('unexpected'))) {
    return 'parse';
  }

  // Reuse the existing keyword classifier for the common HTTP classes.
  const base = classifyApiError(err); // 'auth' | 'quota' | 'network' | 'other'
  return base === 'other' ? 'unknown' : base;
}

/** Maps any thrown value into a sanitized, user-facing `AppError`. */
export function toAppError(err: unknown): AppError {
  const kind = classifyKind(err);
  const copy = COPY[kind];
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const detail = raw ? extractGeminiErrorMessage(raw) : undefined;
  return {
    kind,
    title: copy.title,
    message: copy.message,
    detail: detail && detail !== copy.message ? detail : undefined,
    retryable: copy.retryable,
  };
}
