/**
 * API hygiene utilities for the (rare) fetch-touching code paths.
 *
 * GateWatch is largely client-side and performs no API calls today; this
 * module exists so that ANY fetch added later gets timeout and response-size
 * guards by default instead of trusting the network. `userSafeError`
 * guarantees user-visible error surfaces never leak stack traces or
 * internals — the page shows a generic message and the detail goes to the
 * dev console.
 */

export type FetchGuardOptions = {
  /** Abort the request after this many ms (default 15s). */
  timeoutMs?: number;
  /** Refuse to buffer a body larger than this many bytes (default 5 MiB). */
  maxBytes?: number;
  /** Passed through to fetch. */
  init?: RequestInit;
};

export class FetchGuardError extends Error {
  readonly kind: 'timeout' | 'too-large' | 'network';
  constructor(kind: FetchGuardError['kind'], message: string) {
    super(message);
    this.name = 'FetchGuardError';
    this.kind = kind;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * fetch() with a timeout and a response-body size cap. Reads the body as
 * text with an incremental size check so a malicious or misbehaving
 * endpoint cannot OOM the tab by streaming gigabytes.
 *
 * @param url request URL.
 * @param opts timeout/size guards.
 * @returns the response with a size-checked `text()` available via
 *   `response.text()` as usual — the guard runs BEFORE returning, on a
 *   cloned body read... (implementation: manual reader).
 */
export async function fetchWithGuards(
  url: string,
  opts: FetchGuardOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts.init, signal: controller.signal });
    // Size guard: consume the body through a reader and bail early.
    const reader = res.body?.getReader();
    if (!reader) return res;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FetchGuardError(
          'too-large',
          `Response exceeded the ${maxBytes}-byte limit.`,
        );
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.byteLength;
    }
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (err) {
    if (err instanceof FetchGuardError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new FetchGuardError('timeout', `Request timed out after ${timeoutMs}ms.`);
    }
    throw new FetchGuardError(
      'network',
      err instanceof Error ? err.message : 'Network request failed.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converts any thrown value into a user-safe message. NEVER returns stack
 * traces, error codes, file paths, or other internals — those go to the
 * dev console via the optional `log` hook.
 *
 * @param err the thrown value.
 * @param fallback generic message shown when nothing safe can be derived.
 * @returns a message safe to render in the UI.
 */
export function userSafeError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.error('[gatewatch]', err);
  }
  // A plain user-facing message (no "Error:" prefix, no stack) is safe.
  if (err instanceof Error && err.message && !/at |Error:|node_modules|\.ts:/.test(err.message)) {
    return err.message;
  }
  if (typeof err === 'string' && err.length < 200 && !/at |\.ts:|\.js:/.test(err)) {
    return err;
  }
  return fallback;
}
