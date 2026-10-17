/**
 * RBAC tests: overriding manual-review → authorized requires supervisor;
 * the dev mock denies operators and allows supervisors.
 */
import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  DevMockAuthProvider,
  requiredRoleForOverride,
} from './auth';
import { overrideGateDecision } from './decisions';
import { GateVerificationEventSchema, type GateVerificationEvent } from './contracts';

function makeManualReviewEvent(): GateVerificationEvent {
  return GateVerificationEventSchema.parse({
    id: 'evt-1',
    scannedAtUtc: '2026-10-17T12:00:00Z',
    gateId: 'gate-1',
    direction: 'in',
    vehicle: { plate: '78452-A-17' },
    container: { number: 'MSKU7392017', checkDigitValid: true },
    ocr: { containerConfidence: 55, plateConfidence: 60, engine: 'tesseract.js' },
    appointmentRef: {},
    decision: 'manual-review',
    decidedBy: 'auto-verifier',
    reasonCodes: ['low-container-confidence'],
  });
}

describe('requiredRoleForOverride', () => {
  it('requires supervisor for manual-review → authorized', () => {
    expect(requiredRoleForOverride('manual-review', 'authorized')).toBe('supervisor');
  });
  it('requires supervisor for denied → authorized', () => {
    expect(requiredRoleForOverride('denied', 'authorized')).toBe('supervisor');
  });
  it('lets operators escalate to denied', () => {
    expect(requiredRoleForOverride('manual-review', 'denied')).toBe('operator');
  });
});

describe('DevMockAuthProvider', () => {
  it('respects the role hierarchy', () => {
    const admin = new DevMockAuthProvider('admin');
    expect(admin.hasRole('supervisor')).toBe(true);
    const operator = new DevMockAuthProvider('operator');
    expect(operator.hasRole('supervisor')).toBe(false);
    expect(operator.hasRole('operator')).toBe(true);
    expect(operator.hasRole('viewer')).toBe(true);
  });
  it('requireRole throws AuthorizationError for insufficient roles', () => {
    const viewer = new DevMockAuthProvider('viewer');
    expect(() => viewer.requireRole('operator')).toThrow(AuthorizationError);
  });
  it('is loudly labeled as a dev mock', () => {
    expect(DevMockAuthProvider.IS_DEV_MOCK).toBe(true);
  });
});

describe('overrideGateDecision', () => {
  it('DENIES an operator overriding manual-review → authorized', () => {
    const auth = new DevMockAuthProvider('operator');
    expect(() => overrideGateDecision(makeManualReviewEvent(), 'authorized', auth)).toThrow(
      AuthorizationError,
    );
  });

  it('ALLOWS a supervisor overriding manual-review → authorized', () => {
    const auth = new DevMockAuthProvider('supervisor');
    const res = overrideGateDecision(
      makeManualReviewEvent(),
      'authorized',
      auth,
      '2026-10-17T12:05:00Z',
    );
    expect(res.event.decision).toBe('authorized');
    expect(res.overriddenByRole).toBe('supervisor');
    expect(res.previousDecision).toBe('manual-review');
    expect(res.event.reasonCodes).toContain('override:manual-review->authorized');
  });

  it('DENIES an operator overriding denied → authorized', () => {
    const auth = new DevMockAuthProvider('operator');
    const denied = { ...makeManualReviewEvent(), decision: 'denied' as const };
    expect(() => overrideGateDecision(denied, 'authorized', auth)).toThrow(AuthorizationError);
  });

  it('allows an admin (above supervisor) to override', () => {
    const auth = new DevMockAuthProvider('admin');
    const res = overrideGateDecision(makeManualReviewEvent(), 'authorized', auth);
    expect(res.event.decision).toBe('authorized');
  });

  it('does not mutate the original event', () => {
    const auth = new DevMockAuthProvider('supervisor');
    const original = makeManualReviewEvent();
    overrideGateDecision(original, 'authorized', auth);
    expect(original.decision).toBe('manual-review');
  });

  it('allows an operator to escalate manual-review → denied', () => {
    const auth = new DevMockAuthProvider('operator');
    const res = overrideGateDecision(makeManualReviewEvent(), 'denied', auth);
    expect(res.event.decision).toBe('denied');
  });
});
