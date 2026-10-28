/**
 * Phase D — TAS seam adversarial tests.
 *
 * The adapter validates SHAPE, not provenance. These tests pin exactly
 * what the seam does with hostile input:
 * - malformed payloads → typed issues, manual-review, never authorize,
 *   never throw;
 * - status-enum drift → rejected at the adapter boundary;
 * - replayed / stale payloads → DOCUMENTED as the known replay
 *   limitation (a well-formed stale "confirmed" payload still verifies —
 *   the fix belongs to an authenticated fresh fetch, not this adapter);
 * - duplicate and conflicting records → the seam is stateless and pure,
 *   so identical inputs give identical decisions and conflicts resolve
 *   per-payload (freshness is the fetch layer's job).
 *
 * No claim here fixes replay. Evidence for each claim is the assertion.
 */
import { describe, expect, it } from 'vitest';
import {
  appointmentContractToRef,
  verifyScannedAgainstTasAppointment,
} from './tas-adapter';
import { REASON_CODES, type ScanInput } from './verify';

/** A valid TAS v1.0.0 envelope (confirmed, check digit verified). */
function validPayload(over: Record<string, unknown> = {}): unknown {
  return {
    contractVersion: '1.0.0',
    appointment: {
      id: 'appt_01JADV0000000000000001',
      status: 'confirmed',
      truck: { plate: '48213-A-6', carrier: 'Atlas Freight Maroc' },
      container: { number: 'MSKU0000006', type: '40ft-dry' },
      slot: {
        startUtc: '2026-10-17T09:00:00Z',
        endUtc: '2026-10-17T11:00:00Z',
      },
      terminal: 'T1',
      gate: 'gate-1',
      createdAtUtc: '2026-10-16T12:00:00Z',
      updatedAtUtc: '2026-10-16T12:05:00Z',
      ...over,
    },
  };
}

/** A scan that matches the valid payload exactly. */
const matchingScan: ScanInput = {
  plate: '48213-A-6',
  containerNumber: 'MSKU0000006',
  scannedAtUtc: '2026-10-17T10:00:00Z',
  gate: 'gate-1',
  containerConfidence: 92,
  plateConfidence: 88,
};

describe('TAS seam — malformed payloads never authorize and never throw', () => {
  const malformed: { name: string; payload: unknown }[] = [
    { name: 'null', payload: null },
    { name: 'undefined', payload: undefined },
    { name: 'a string', payload: 'confirmed' },
    { name: 'a number', payload: 42 },
    { name: 'an array', payload: [] },
    { name: 'empty object', payload: {} },
    {
      name: 'envelope without contractVersion',
      payload: { appointment: {} },
    },
    {
      name: 'non-string contractVersion',
      payload: { contractVersion: 1, appointment: {} },
    },
    {
      name: 'null appointment',
      payload: { contractVersion: '1.0.0', appointment: null },
    },
    {
      name: 'unknown top-level field (strict envelope)',
      payload: { ...(validPayload() as object), injected: 'x' },
    },
    {
      name: 'unknown appointment field (strict shape)',
      payload: validPayload({ forged: true }),
    },
    {
      name: 'bad ISO 6346 check digit',
      payload: validPayload({
        container: { number: 'MSKU0000007', type: '40ft-dry' },
      }),
    },
    {
      name: 'container number wrong shape (lowercase)',
      payload: validPayload({
        container: { number: 'msku0000006', type: '40ft-dry' },
      }),
    },
    {
      name: 'container number wrong shape (dashes)',
      payload: validPayload({
        container: { number: 'MSKU-000000-6', type: '40ft-dry' },
      }),
    },
    {
      name: 'slot end before start',
      payload: validPayload({
        slot: {
          startUtc: '2026-10-17T11:00:00Z',
          endUtc: '2026-10-17T09:00:00Z',
        },
      }),
    },
    {
      name: 'non-UTC datetime (no Z)',
      payload: validPayload({
        slot: {
          startUtc: '2026-10-17T09:00:00+01:00',
          endUtc: '2026-10-17T11:00:00Z',
        },
      }),
    },
    {
      name: 'unparseable datetime',
      payload: validPayload({ createdAtUtc: 'yesterday-ish' }),
    },
    {
      name: 'appointment id wrong shape',
      payload: validPayload({ id: 'booking-123' }),
    },
    {
      name: 'empty plate',
      payload: validPayload({ truck: { plate: '', carrier: 'X' } }),
    },
    {
      name: 'plate over max length',
      payload: validPayload({ truck: { plate: 'X'.repeat(33), carrier: 'X' } }),
    },
    {
      name: 'gate over max length',
      payload: validPayload({ gate: 'G'.repeat(17) }),
    },
    {
      name: 'status as a number (type confusion)',
      payload: validPayload({ status: 1 }),
    },
    {
      name: 'status null (type confusion)',
      payload: validPayload({ status: null }),
    },
    {
      name: 'truck as a string (type confusion)',
      payload: validPayload({ truck: '48213-A-6' }),
    },
    {
      name: 'slot null (type confusion)',
      payload: validPayload({ slot: null }),
    },
    {
      name: 'prototype-shaped key',
      payload: JSON.parse(
        '{"contractVersion":"1.0.0","appointment":{"__proto__":{"status":"confirmed"}}}',
      ),
    },
  ];

  it.each(malformed.map((m) => [m.name, m.payload] as [string, unknown]))(
    'adapter rejects %s with issues (never throws)',
    (_name, payload) => {
      let res;
      expect(() => {
        res = appointmentContractToRef(payload);
      }).not.toThrow();
      expect(res!.ok).toBe(false);
      if (!res!.ok) expect(res!.issues.length).toBeGreaterThan(0);
    },
  );

  it.each(malformed.map((m) => [m.name, m.payload] as [string, unknown]))(
    'seam degrades %s to manual-review, never authorized',
    (_name, payload) => {
      const res = verifyScannedAgainstTasAppointment(matchingScan, payload);
      expect(res.decision).toBe('manual-review');
      expect(res.decision).not.toBe('authorized');
      expect(res.reasonCodes).toContain(REASON_CODES.APPOINTMENT_REF_INVALID);
      expect(res.adapterIssues!.length).toBeGreaterThan(0);
    },
  );
});

describe('TAS seam — status policy under adversarial drift', () => {
  it('rejects unknown / drifted status values at the adapter', () => {
    const drifted = [
      'on-hold',
      'CONFIRMED',
      'Confirmed',
      'checked_in',
      'checkedin',
      '',
      ' ',
      'cancelled ', // trailing space
      'confirmed\u0000',
    ];
    for (const status of drifted) {
      const res = appointmentContractToRef(validPayload({ status }));
      expect(res.ok).toBe(false);
      const seam = verifyScannedAgainstTasAppointment(
        matchingScan,
        validPayload({ status }),
      );
      expect(seam.decision).not.toBe('authorized');
    }
  });

  it('maps every valid status to its documented decision', () => {
    const expectations: Record<string, 'authorized' | 'denied' | 'manual-review'> = {
      confirmed: 'authorized',
      'checked-in': 'authorized',
      cancelled: 'denied',
      completed: 'denied',
      'no-show': 'denied',
      requested: 'manual-review',
    };
    for (const [status, expected] of Object.entries(expectations)) {
      const res = verifyScannedAgainstTasAppointment(
        matchingScan,
        validPayload({ status }),
      );
      expect(res.decision).toBe(expected);
    }
  });

  it('a cancelled payload denies even when everything else matches', () => {
    const res = verifyScannedAgainstTasAppointment(
      matchingScan,
      validPayload({ status: 'cancelled' }),
    );
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.APPOINTMENT_CANCELLED);
  });
});

describe('TAS seam — replay and staleness (KNOWN LIMITATION, documented not fixed)', () => {
  it('a stale but well-formed "confirmed" payload still authorizes — replay is a real attack on this seam', () => {
    // Scenario: the truck's appointment was confirmed yesterday, then
    // cancelled this morning. An attacker (or a stale cache) replays
    // yesterday's confirmed payload. The adapter validates SHAPE, not
    // provenance: nothing here authenticates the sender, checks a
    // signature, or verifies freshness — so the replay verifies.
    // This test LOCKS IN the honest statement of the limitation. The fix
    // is an authenticated, per-scan fresh fetch (see the trust assumption
    // in tas-adapter.ts), not a change to this function.
    const staleConfirmed = validPayload({
      id: 'appt_01JADV0000000000000001',
      status: 'confirmed',
      createdAtUtc: '2026-10-16T12:00:00Z',
      updatedAtUtc: '2026-10-16T12:05:00Z', // a day old
    });
    const replay = verifyScannedAgainstTasAppointment(
      matchingScan,
      staleConfirmed,
    );
    expect(replay.decision).toBe('authorized');
  });

  it('stale timestamps are not a freshness signal — a 2020 payload with status confirmed still authorizes', () => {
    const ancient = validPayload({
      createdAtUtc: '2020-01-01T00:00:00Z',
      updatedAtUtc: '2020-01-01T00:00:01Z',
      slot: {
        startUtc: '2026-10-17T09:00:00Z',
        endUtc: '2026-10-17T11:00:00Z',
      },
    });
    const res = appointmentContractToRef(ancient);
    expect(res.ok).toBe(true); // no freshness concept at the adapter
    const seam = verifyScannedAgainstTasAppointment(matchingScan, ancient);
    expect(seam.decision).toBe('authorized');
  });

  it('the seam is stateless: duplicates decide identically, conflicts resolve per-payload', () => {
    // Duplicate submission of the same (scan, payload): identical decision.
    const first = verifyScannedAgainstTasAppointment(
      matchingScan,
      validPayload(),
    );
    const second = verifyScannedAgainstTasAppointment(
      matchingScan,
      validPayload(),
    );
    expect(second.decision).toBe(first.decision);
    expect(second.reasonCodes).toEqual(first.reasonCodes);

    // Conflicting records for the same appointment id: the seam keeps no
    // memory, so each payload decides on its own content. The fetch layer
    // must guarantee it hands the seam the CURRENT record — a stale
    // "confirmed" copy handed after a "cancelled" one still authorizes.
    const id = 'appt_01JADV0000000000000001';
    const cancelled = verifyScannedAgainstTasAppointment(
      matchingScan,
      validPayload({ id, status: 'cancelled' }),
    );
    const replayedConfirmed = verifyScannedAgainstTasAppointment(
      matchingScan,
      validPayload({ id, status: 'confirmed' }),
    );
    expect(cancelled.decision).toBe('denied');
    expect(replayedConfirmed.decision).toBe('authorized');
  });
});
