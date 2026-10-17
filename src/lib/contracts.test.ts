/**
 * Phase C contract tests: versioned gate-verification event + appointment
 * reference shapes, and the core safety refinement — OCR alone must never
 * authorize.
 */
import { describe, expect, it } from 'vitest';
import {
  AUTH_CONFIDENCE_THRESHOLD,
  AppointmentRefSchema,
  GATE_EVENT_CONTRACT_VERSION,
  GateScanSubmissionSchema,
  GateVerificationEventSchema,
  LegacyGateLogEntrySchema,
  LegacyReviewItemSchema,
  LegacySlotSchema,
  TAS_APPOINTMENT_CONTRACT_VERSION_EXPECTED,
  type GateVerificationEvent,
} from './contracts';

const baseEvent = {
  id: 'evt-1',
  scannedAtUtc: '2026-10-17T12:00:00Z',
  gateId: 'gate-1',
  direction: 'in',
  vehicle: { plate: '78452-A-17' },
  container: { number: 'MSKU7392017', checkDigitValid: true },
  ocr: { containerConfidence: 92, plateConfidence: 88, engine: 'tesseract.js' },
  appointmentRef: { appointmentId: 'slot-1', contractVersion: '1.0.0' },
  decidedBy: 'auto-verifier',
  reasonCodes: ['verified-match'],
} as const;

function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...baseEvent,
    ocr: { ...baseEvent.ocr },
    vehicle: { ...baseEvent.vehicle },
    container: { ...baseEvent.container },
    appointmentRef: { ...baseEvent.appointmentRef },
    ...overrides,
  };
}

describe('contract versions', () => {
  it('pins the gate-event contract version', () => {
    expect(GATE_EVENT_CONTRACT_VERSION).toBe('1.0.0');
  });
  it('pins the expected TAS appointment contract version', () => {
    expect(TAS_APPOINTMENT_CONTRACT_VERSION_EXPECTED).toBe('1.0.0');
  });
});

describe('GateVerificationEventSchema', () => {
  it('accepts a fully valid event', () => {
    const res = GateVerificationEventSchema.safeParse(makeEvent({ decision: 'authorized' }));
    expect(res.success).toBe(true);
  });

  it('REJECTS authorized when container confidence is below threshold', () => {
    const res = GateVerificationEventSchema.safeParse(
      makeEvent({
        decision: 'authorized',
        ocr: { containerConfidence: AUTH_CONFIDENCE_THRESHOLD - 1, plateConfidence: 95, engine: 'tesseract.js' },
      }),
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('never authorize'))).toBe(true);
    }
  });

  it('REJECTS authorized when plate confidence is below threshold', () => {
    const res = GateVerificationEventSchema.safeParse(
      makeEvent({
        decision: 'authorized',
        ocr: { containerConfidence: 95, plateConfidence: 10, engine: 'tesseract.js' },
      }),
    );
    expect(res.success).toBe(false);
  });

  it('REJECTS authorized when there is no appointment reference — OCR alone must never authorize', () => {
    const res = GateVerificationEventSchema.safeParse(
      makeEvent({ decision: 'authorized', appointmentRef: {} }),
    );
    expect(res.success).toBe(false);
  });

  it('ACCEPTS manual-review with low confidence and no appointment', () => {
    const res = GateVerificationEventSchema.safeParse(
      makeEvent({
        decision: 'manual-review',
        ocr: { containerConfidence: 12, plateConfidence: 8, engine: 'tesseract.js' },
        appointmentRef: {},
      }),
    );
    expect(res.success).toBe(true);
  });

  it('ACCEPTS denied with low confidence and no appointment', () => {
    const res = GateVerificationEventSchema.safeParse(
      makeEvent({ decision: 'denied', appointmentRef: {} }),
    );
    expect(res.success).toBe(true);
  });

  it('REJECTS NaN confidence — the Phase B regression stays fixed at the contract boundary', () => {
    const res = GateVerificationEventSchema.safeParse(
      makeEvent({
        decision: 'manual-review',
        ocr: { containerConfidence: NaN, plateConfidence: 90, engine: 'tesseract.js' },
      }),
    );
    expect(res.success).toBe(false);
  });

  it('REJECTS non-ISO timestamps and unknown directions', () => {
    expect(
      GateVerificationEventSchema.safeParse(makeEvent({ scannedAtUtc: 'yesterday' })).success,
    ).toBe(false);
    expect(
      GateVerificationEventSchema.safeParse(makeEvent({ direction: 'sideways' })).success,
    ).toBe(false);
  });

  it('accepts an optional idempotency key', () => {
    const res = GateVerificationEventSchema.safeParse(
      makeEvent({ decision: 'manual-review', idempotencyKey: 'lane-2-abc' }),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      const event = res.data as GateVerificationEvent;
      expect(event.idempotencyKey).toBe('lane-2-abc');
    }
  });
});

describe('AppointmentRefSchema (duplicated minimal TAS shape)', () => {
  it('accepts a complete appointment reference', () => {
    const res = AppointmentRefSchema.safeParse({
      appointmentId: 'slot-1',
      status: 'scheduled',
      containerNumber: 'MSKU7392017',
      plate: '78452-A-17',
      slotStartUtc: '2026-10-17T09:00:00Z',
      slotEndUtc: '2026-10-17T11:00:00Z',
      gate: 1,
    });
    expect(res.success).toBe(true);
  });

  it('rejects unknown statuses and malformed datetimes', () => {
    expect(
      AppointmentRefSchema.safeParse({
        appointmentId: 'slot-1',
        status: 'maybe',
        containerNumber: 'X',
        plate: 'Y',
        slotStartUtc: '2026-10-17T09:00:00Z',
        slotEndUtc: '2026-10-17T11:00:00Z',
        gate: 'gate-1',
      }).success,
    ).toBe(false);
  });
});

describe('GateScanSubmissionSchema', () => {
  it('rejects NaN confidence on the ingestion path', () => {
    const res = GateScanSubmissionSchema.safeParse({
      scannedAtUtc: '2026-10-17T12:00:00Z',
      gateId: 'gate-1',
      direction: 'in',
      plate: 'P',
      containerNumber: 'C',
      containerConfidence: NaN,
      plateConfidence: 90,
      engine: 'tesseract.js',
    });
    expect(res.success).toBe(false);
  });
});

describe('legacy on-load validation contracts', () => {
  it('accepts a well-formed legacy gate-log entry', () => {
    expect(
      LegacyGateLogEntrySchema.safeParse({
        id: 'a',
        ts: 123,
        image: 'x.png',
        plate: 'P',
        container: 'C',
        isoValid: true,
        result: 'match',
        processingMs: 10,
      }).success,
    ).toBe(true);
  });

  it('rejects a corrupted legacy log entry (wrong types)', () => {
    expect(
      LegacyGateLogEntrySchema.safeParse({
        id: 'a',
        ts: 'not-a-number',
        plate: 42,
        container: 'C',
        isoValid: 'yes',
        result: 'match',
      }).success,
    ).toBe(false);
  });

  it('rejects a review item with a non-finite confidence', () => {
    expect(
      LegacyReviewItemSchema.safeParse({
        id: 'r',
        batchId: 'b',
        imageName: 'n',
        imageUrl: 'u',
        ocrPlate: 'P',
        ocrContainer: 'C',
        confidence: NaN,
        plate: 'P',
        container: 'C',
        status: 'pending',
        decidedAt: null,
      }).success,
    ).toBe(false);
  });

  it('rejects a slot with an invalid gate number', () => {
    expect(
      LegacySlotSchema.safeParse({
        id: 's',
        plate: 'P',
        container: 'C',
        company: 'co',
        line: 'l',
        gate: 9,
        windowStart: '09:00',
        windowEnd: '11:00',
      }).success,
    ).toBe(false);
  });
});
