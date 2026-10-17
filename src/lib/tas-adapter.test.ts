/**
 * Fixture-driven tests for the TAS → GateWatch appointment adapter
 * (src/lib/tas-adapter.ts): version pinning, shape validation, ref
 * mapping, and the end-to-end scanned-event + TAS-payload seam.
 */
import { describe, expect, it } from 'vitest';
import {
  appointmentContractToRef,
  verifyScannedAgainstTasAppointment,
} from './tas-adapter';
import { TAS_APPOINTMENT_CONTRACT_VERSION_EXPECTED as EXPECTED } from './contracts';
import { REASON_CODES, type ScanInput } from './verify';

/** A full TAS AppointmentContract v1.0.0 document in the wire envelope. */
const tasPayload = {
  contractVersion: '1.0.0',
  appointment: {
    id: 'appt_01JABCD0123456789ABCDEF',
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
  },
};

const baseScan: ScanInput = {
  plate: '48213-A-6',
  containerNumber: 'MSKU0000006',
  scannedAtUtc: '2026-10-17T10:00:00Z',
  gate: 'gate-1',
  containerConfidence: 92,
  plateConfidence: 88,
};

describe('appointmentContractToRef', () => {
  it('maps a valid TAS payload onto the exact AppointmentRef', () => {
    const res = appointmentContractToRef(tasPayload);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ref).toEqual({
      appointmentId: 'appt_01JABCD0123456789ABCDEF',
      status: 'confirmed',
      containerNumber: 'MSKU0000006',
      plate: '48213-A-6',
      slotStartUtc: '2026-10-17T09:00:00Z',
      slotEndUtc: '2026-10-17T11:00:00Z',
      gate: 'gate-1',
    });
  });

  it('rejects a version mismatch with a clear expected-vs-found error', () => {
    const res = appointmentContractToRef({
      ...tasPayload,
      contractVersion: '2.0.0',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0].path).toBe('contractVersion');
    expect(res.issues[0].code).toBe('version_mismatch');
    expect(res.issues[0].message).toContain(
      `"${EXPECTED}"`,
    );
    expect(res.issues[0].message).toContain('"2.0.0"');
  });

  it('returns issues (never throws) for missing fields', () => {
    const res = appointmentContractToRef({
      contractVersion: '1.0.0',
      appointment: {
        id: 'appt_01JABCD0123456789ABCDEF',
        status: 'confirmed',
        // truck and container.number omitted entirely
        slot: {
          startUtc: '2026-10-17T09:00:00Z',
          endUtc: '2026-10-17T11:00:00Z',
        },
        terminal: 'T1',
        gate: 'gate-1',
        createdAtUtc: '2026-10-16T12:00:00Z',
        updatedAtUtc: '2026-10-16T12:05:00Z',
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.length).toBeGreaterThan(0);
    expect(
      res.issues.some((i) => i.path.startsWith('appointment.truck')),
    ).toBe(true);
    expect(
      res.issues.some((i) => i.path.startsWith('appointment.container')),
    ).toBe(true);
  });

  it('rejects an invalid ISO 6346 check digit', () => {
    const res = appointmentContractToRef({
      ...tasPayload,
      appointment: {
        ...tasPayload.appointment,
        container: { number: 'MSKU0000007', type: '40ft-dry' },
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(
      res.issues.some((i) => i.path === 'appointment.container.number'),
    ).toBe(true);
  });

  it('rejects a payload with no contractVersion at all', () => {
    const res = appointmentContractToRef({ appointment: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(
      res.issues.some((i) => i.path === 'contractVersion'),
    ).toBe(true);
  });

  it('rejects non-object payloads without throwing', () => {
    for (const raw of [null, undefined, 42, 'appt_123', []]) {
      expect(appointmentContractToRef(raw).ok).toBe(false);
    }
  });
});

describe('verifyScannedAgainstTasAppointment (the seam)', () => {
  it('authorizes a matching scan against a valid TAS appointment', () => {
    const res = verifyScannedAgainstTasAppointment(baseScan, tasPayload);
    expect(res.decision).toBe('authorized');
    expect(res.reasonCodes).toContain(REASON_CODES.VERIFIED_MATCH);
    expect(res.adapterIssues).toBeUndefined();
  });

  it('denies a wrong container', () => {
    const res = verifyScannedAgainstTasAppointment(
      { ...baseScan, containerNumber: 'TCLU4829132' },
      tasPayload,
    );
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.CONTAINER_MISMATCH);
  });

  it('denies a cancelled appointment', () => {
    const res = verifyScannedAgainstTasAppointment(baseScan, {
      ...tasPayload,
      appointment: { ...tasPayload.appointment, status: 'cancelled' },
    });
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.APPOINTMENT_CANCELLED);
  });

  it('routes a requested (unconfirmed) appointment to manual review', () => {
    const res = verifyScannedAgainstTasAppointment(baseScan, {
      ...tasPayload,
      appointment: { ...tasPayload.appointment, status: 'requested' },
    });
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.APPOINTMENT_UNCONFIRMED);
  });

  it('never authorizes on low OCR confidence', () => {
    const res = verifyScannedAgainstTasAppointment(
      { ...baseScan, plateConfidence: 40 },
      tasPayload,
    );
    expect(res.decision).not.toBe('authorized');
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.LOW_PLATE_CONFIDENCE);
  });

  it('routes an out-of-window scan to manual review (verify.ts policy)', () => {
    const res = verifyScannedAgainstTasAppointment(
      { ...baseScan, scannedAtUtc: '2026-10-17T13:30:00Z' },
      tasPayload,
    );
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.OUTSIDE_SLOT_WINDOW);
  });

  it('degrades to manual-review (never authorized) on an invalid payload', () => {
    const res = verifyScannedAgainstTasAppointment(baseScan, {
      ...tasPayload,
      contractVersion: '2.0.0',
    });
    expect(res.decision).not.toBe('authorized');
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.APPOINTMENT_REF_INVALID);
    expect(res.adapterIssues).toBeDefined();
    expect(res.adapterIssues!.length).toBeGreaterThan(0);
  });
});

describe('seam version pin', () => {
  it('pins GateWatch\'s TAS expectation to 1.0.0', () => {
    expect(EXPECTED).toBe('1.0.0');
  });
});
