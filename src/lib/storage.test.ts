/**
 * Tests for the validated localStorage boundary: corrupted payloads are
 * quarantined, never silently dropped, never crashing the app.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  clearQuarantineRegister,
  getQuarantineRegister,
  loadValidatedList,
  saveValidatedList,
} from './storage';
import { LegacyGateLogEntrySchema, LegacySlotSchema } from './contracts';

function installLocalStorageStub(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    _store: store,
  };
  vi.stubGlobal('localStorage', stub);
  vi.stubGlobal('window', { localStorage: stub });
  return stub;
}

const validEntry = {
  id: 'a',
  ts: 123,
  image: 'x.png',
  plate: 'P',
  container: 'C',
  isoValid: true,
  result: 'match',
  processingMs: 10,
};

beforeEach(() => {
  vi.unstubAllGlobals();
  clearQuarantineRegister();
});

describe('loadValidatedList', () => {
  it('returns the fallback when nothing is stored', () => {
    installLocalStorageStub();
    const res = loadValidatedList('k', LegacyGateLogEntrySchema, [validEntry]);
    expect(res.valid).toEqual([validEntry]);
    expect(res.quarantined).toEqual([]);
  });

  it('keeps valid entries and quarantines corrupted ones individually', () => {
    const corrupted = { id: 'bad', ts: 'not-a-number', plate: 42 };
    installLocalStorageStub({
      k: JSON.stringify([validEntry, corrupted, validEntry]),
    });
    const res = loadValidatedList('k', LegacyGateLogEntrySchema, []);
    expect(res.valid).toHaveLength(2);
    expect(res.quarantined).toHaveLength(1);
    expect(res.quarantined[0].index).toBe(1);
    expect(res.quarantined[0].raw).toEqual(corrupted);
    // Surfaced in the session register for the UI banner.
    expect(getQuarantineRegister()).toHaveLength(1);
  });

  it('quarantines a malformed-JSON payload and returns the fallback — no crash', () => {
    installLocalStorageStub({ k: '{not json' });
    const res = loadValidatedList('k', LegacyGateLogEntrySchema, [validEntry]);
    expect(res.valid).toEqual([validEntry]);
    expect(res.quarantined).toHaveLength(1);
    expect(res.quarantined[0].index).toBeNull();
    expect(res.quarantined[0].reason).toContain('not valid JSON');
  });

  it('quarantines a non-array payload and returns the fallback', () => {
    installLocalStorageStub({ k: JSON.stringify({ oops: true }) });
    const res = loadValidatedList('k', LegacySlotSchema, []);
    expect(res.valid).toEqual([]);
    expect(res.quarantined).toHaveLength(1);
    expect(res.quarantined[0].reason).toContain('not an array');
  });

  it('never throws when localStorage itself is unavailable', () => {
    vi.stubGlobal('window', undefined);
    const res = loadValidatedList('k', z.string(), ['fallback']);
    expect(res.valid).toEqual(['fallback']);
    expect(res.quarantined).toEqual([]);
  });

  it('round-trips valid data through save/load', () => {
    const stub = installLocalStorageStub();
    saveValidatedList('k', [validEntry]);
    expect(stub._store.get('k')).toBe(JSON.stringify([validEntry]));
    const res = loadValidatedList('k', LegacyGateLogEntrySchema, []);
    expect(res.valid).toEqual([validEntry]);
    expect(res.quarantined).toEqual([]);
  });
});
