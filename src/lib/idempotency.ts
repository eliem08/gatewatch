/**
 * Idempotent gate-event submission.
 *
 * Two keys prevent duplicates:
 * 1. Explicit `idempotencyKey` (preferred) — the scanner assigns one per
 *    physical crossing (e.g. `lane-2-<uuid>`); retries of the same scan
 *    carry the same key.
 * 2. Natural key — gate + direction + container + plate + scan timestamp,
 *    normalized. Catches duplicates that arrived without an explicit key.
 *
 * `submit` is the single choke point: an exact duplicate or a near-duplicate
 * retry returns the ORIGINAL event with `duplicate: true` instead of
 * creating a second record. The store is in-memory and pure (testable);
 * callers persist via the validated localStorage boundary in storage.ts.
 *
 * DEMO-ONLY: an in-memory dedupe set does not survive reloads and is not
 * shared across lanes/browsers. Production dedupe belongs in the
 * server-side ingestion service with a unique constraint on the key.
 */

import type { GateVerificationEvent } from './contracts';

function normalizeKeyPart(value: string): string {
  return (value ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/** Deterministic natural key for one physical crossing. */
export function naturalKeyOf(event: GateVerificationEvent): string {
  return [
    normalizeKeyPart(event.gateId),
    event.direction,
    normalizeKeyPart(event.container.number),
    normalizeKeyPart(event.vehicle.plate),
    event.scannedAtUtc,
  ].join('|');
}

export type SubmitResult =
  | { event: GateVerificationEvent; duplicate: false }
  | { event: GateVerificationEvent; duplicate: true };

/**
 * In-memory idempotent gate-event store.
 */
export class GateEventStore {
  private byId = new Map<string, GateVerificationEvent>();
  private byIdempotencyKey = new Map<string, string>();
  private byNaturalKey = new Map<string, string>();

  /** Seed from already-validated records (e.g. loaded via storage.ts). */
  seed(events: GateVerificationEvent[]): void {
    for (const e of events) this.index(e);
  }

  private index(event: GateVerificationEvent): void {
    this.byId.set(event.id, event);
    if (event.idempotencyKey) this.byIdempotencyKey.set(event.idempotencyKey, event.id);
    this.byNaturalKey.set(naturalKeyOf(event), event.id);
  }

  /**
   * Submits one gate event. Duplicates (same idempotency key, or same
   * natural key when no key is given) return the original event.
   */
  submit(event: GateVerificationEvent): SubmitResult {
    if (event.idempotencyKey) {
      const existingId = this.byIdempotencyKey.get(event.idempotencyKey);
      if (existingId) {
        const existing = this.byId.get(existingId);
        if (existing) return { event: existing, duplicate: true };
      }
    }
    const naturalId = this.byNaturalKey.get(naturalKeyOf(event));
    if (naturalId) {
      const existing = this.byId.get(naturalId);
      if (existing) return { event: existing, duplicate: true };
    }
    this.index(event);
    return { event, duplicate: false };
  }

  list(): GateVerificationEvent[] {
    return Array.from(this.byId.values());
  }

  get length(): number {
    return this.byId.size;
  }
}
