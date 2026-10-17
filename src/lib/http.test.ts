/**
 * Tests for fetch guards (timeout + size cap) and the user-safe error
 * surface (no stack traces / internals leak to the UI).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FetchGuardError,
  fetchWithGuards,
  userSafeError,
} from './http';

function fakeResponse(body: Uint8Array): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(body);
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithGuards', () => {
  it('returns a normal response untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(new TextEncoder().encode('ok'))),
    );
    const res = await fetchWithGuards('https://example.test/x');
    expect(await res.text()).toBe('ok');
  });

  it('refuses a body larger than maxBytes', async () => {
    const big = new Uint8Array(2048).fill(1);
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(big)));
    await expect(
      fetchWithGuards('https://example.test/x', { maxBytes: 100 }),
    ).rejects.toMatchObject({ name: 'FetchGuardError', kind: 'too-large' });
  });

  it('aborts and reports a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    await expect(
      fetchWithGuards('https://example.test/x', { timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('FetchGuardError carries its kind', () => {
    const err = new FetchGuardError('network', 'boom');
    expect(err.kind).toBe('network');
    expect(err.name).toBe('FetchGuardError');
  });
});

describe('userSafeError', () => {
  it('passes through a plain user-facing message', () => {
    expect(userSafeError(new Error('Could not load the selected image.'))).toBe(
      'Could not load the selected image.',
    );
  });

  it('falls back when the message contains a stack trace or file internals', () => {
    const err = new Error('boom\n    at recognizeImage (/app/src/lib/ocr.ts:12:3)');
    expect(userSafeError(err)).toBe('Something went wrong. Please try again.');
  });

  it('falls back on non-error values and long strings', () => {
    expect(userSafeError(42)).toBe('Something went wrong. Please try again.');
    expect(userSafeError(null)).toBe('Something went wrong. Please try again.');
    expect(userSafeError('x'.repeat(500))).toBe('Something went wrong. Please try again.');
  });

  it('uses a custom fallback when provided', () => {
    const err = new Error('boom\n    at bad (/app/src/lib/x.ts:1:1)');
    expect(userSafeError(err, 'Scan failed.')).toBe('Scan failed.');
  });
});
