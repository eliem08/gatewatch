/**
 * Idempotency tests: exact duplicates and near-duplicate retries return
 * the original event instead of creating a second record.
 */
import { describe, expect, it } from 'vitest';
import { GateEventStore, naturalKeyOf } from './idempotency';
import { GateVerificationEventSchema, type GateVerificationEvent } from './contracts';

function makeEvent(overrides: Record<string, unknown> = {}): GateVerificationEvent {
  const raw = {
    id: 'evt-1',
    scannedAtUtc: '2026-10-17T12:00:00Z',
    gateId: 'gate-1',
    direction: 'in',
    vehicle: { plate: '78452-A-17' },
    container: { number: 'MSKU7392017', checkDigitValid: true },
    ocr: { containerConfidence: 92, plateConfidence: 88, engine: 'tesseract.js' },
    appointmentRef: { appointmentId: 'slot-1', contractVersion: '1.0.0' },
    decision: 'authorized',
    decidedBy: 'auto-verifier',
    reasonCodes: ['verified-match'],
    ...overrides,
  };
  return GateVerificationEventSchema.parse(raw);
}

describe('GateEventStore idempotency', () => {
  it('stores a first submission as new', () => {
    const store = new GateEventStore();
    const res = store.submit(makeEvent());
    expect(res.duplicate).toBe(false);
    expect(store.length).toBe(1);
  });

  it('returns the original event for an exact duplicate retry (same idempotency key)', () => {
    const store = new GateEventStore();
    const first = makeEvent({ idempotencyKey: 'lane-2-abc' });
    store.submit(first);
    const retry = makeEvent({ id: 'evt-RETRY', idempotencyKey: 'lane-2-abc' });
    const res = store.submit(retry);
    expect(res.duplicate).toBe(true);
    expect(res.event.id).toBe('evt-1');
    expect(store.length).toBe(1);
  });

  it('dedupes by natural key when no idempotency key is present', () => {
    const store = new GateEventStore();
    store.submit(makeEvent({ id: 'evt-1' }));
    const res = store.submit(makeEvent({ id: 'evt-2' }));
    expect(res.duplicate).toBe(true);
    expect(res.event.id).toBe('evt-1');
    expect(store.length).toBe(1);
  });

  it('treats a rescan with a different timestamp as a distinct event', () => {
    const store = new GateEventStore();
    store.submit(makeEvent({ id: 'evt-1' }));
    const res = store.submit(
      makeEvent({ id: 'evt-2', scannedAtUtc: '2026-10-17T12:05:00Z' }),
    );
    expect(res.duplicate).toBe(false);
    expect(store.length).toBe(2);
  });

  it('normalizes the natural key against case/space/dash OCR quirks', () => {
    const store = new GateEventStore();
    store.submit(makeEvent({ id: 'evt-1' }));
    const res = store.submit(
      makeEvent({
        id: 'evt-2',
        vehicle: { plate: '78452 a 17' },
        container: { number: 'msku-7392017', checkDigitValid: true },
      }),
    );
    expect(res.duplicate).toBe(true);
  });

  it('naturalKeyOf is deterministic', () => {
    expect(naturalKeyOf(makeEvent())).toBe(naturalKeyOf(makeEvent()));
  });
});
