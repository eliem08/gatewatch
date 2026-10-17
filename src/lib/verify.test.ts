/**
 * Fixture-driven tests for verifyGateEventAgainstAppointment.
 */
import { describe, expect, it } from 'vitest';
import {
  REASON_CODES,
  verifyGateEventAgainstAppointment,
  type ScanInput,
} from './verify';
import type { AppointmentRef } from './contracts';

const baseScan: ScanInput = {
  plate: '78452-A-17',
  containerNumber: 'MSKU7392017',
  scannedAtUtc: '2026-10-17T10:00:00Z',
  gate: 'gate-1',
  containerConfidence: 92,
  plateConfidence: 88,
};

const baseAppointment: AppointmentRef = {
  appointmentId: 'slot-1',
  status: 'scheduled',
  containerNumber: 'MSKU7392017',
  plate: '78452-A-17',
  slotStartUtc: '2026-10-17T09:00:00Z',
  slotEndUtc: '2026-10-17T11:00:00Z',
  gate: 'gate-1',
};

describe('verifyGateEventAgainstAppointment', () => {
  it('authorizes a valid match', () => {
    const res = verifyGateEventAgainstAppointment(baseScan, baseAppointment);
    expect(res.decision).toBe('authorized');
    expect(res.reasonCodes).toContain(REASON_CODES.VERIFIED_MATCH);
  });

  it('denies a container mismatch', () => {
    const res = verifyGateEventAgainstAppointment(
      { ...baseScan, containerNumber: 'TCLU4829132' },
      baseAppointment,
    );
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.CONTAINER_MISMATCH);
  });

  it('denies a plate mismatch', () => {
    const res = verifyGateEventAgainstAppointment(
      { ...baseScan, plate: '91208-B-45' },
      baseAppointment,
    );
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.PLATE_MISMATCH);
  });

  it('routes an out-of-window scan to manual review', () => {
    const res = verifyGateEventAgainstAppointment(
      { ...baseScan, scannedAtUtc: '2026-10-17T13:30:00Z' },
      baseAppointment,
    );
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.OUTSIDE_SLOT_WINDOW);
  });

  it('denies a cancelled appointment', () => {
    const res = verifyGateEventAgainstAppointment(baseScan, {
      ...baseAppointment,
      status: 'cancelled',
    });
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.APPOINTMENT_CANCELLED);
  });

  it('denies a completed appointment', () => {
    const res = verifyGateEventAgainstAppointment(baseScan, {
      ...baseAppointment,
      status: 'completed',
    });
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.APPOINTMENT_NOT_ACTIVE);
  });

  it('routes low OCR confidence to manual review even when everything matches', () => {
    const res = verifyGateEventAgainstAppointment(
      { ...baseScan, plateConfidence: 40 },
      baseAppointment,
    );
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.LOW_PLATE_CONFIDENCE);
  });

  it('routes a scan with no appointment reference to manual review', () => {
    const res = verifyGateEventAgainstAppointment(baseScan, null);
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.NO_APPOINTMENT_REF);
  });

  it('routes a wrong-gate scan to manual review', () => {
    const res = verifyGateEventAgainstAppointment({ ...baseScan, gate: 'gate-2' }, baseAppointment);
    expect(res.decision).toBe('manual-review');
    expect(res.reasonCodes).toContain(REASON_CODES.GATE_MISMATCH);
  });

  it('normalizes case/spaces/dashes so OCR quirks still verify', () => {
    const res = verifyGateEventAgainstAppointment(
      { ...baseScan, containerNumber: 'msku 739201 7', plate: '78452-a-17' },
      baseAppointment,
    );
    expect(res.decision).toBe('authorized');
  });

  it('identifier mismatches take precedence over low confidence (deny, do not defer)', () => {
    const res = verifyGateEventAgainstAppointment(
      { ...baseScan, containerNumber: 'TCLU4829132', plateConfidence: 30 },
      baseAppointment,
    );
    expect(res.decision).toBe('denied');
    expect(res.reasonCodes).toContain(REASON_CODES.CONTAINER_MISMATCH);
  });
});
