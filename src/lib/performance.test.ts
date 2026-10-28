/**
 * Phase D — verification-pipeline throughput.
 *
 * Measures batch throughput of the pure verification path:
 *   routeScan -> verifyGateEventAgainstAppointment -> TAS adapter seam
 * on N=100 and N=1000 scans, single-threaded Node, this machine.
 *
 * These are SOFTWARE throughput numbers for the decision pipeline only.
 * They say nothing about OCR latency: the browser-executed Tesseract
 * paths are unit-tested with mocks and never run live in this suite —
 * real OCR cost is dominated by the Tesseract worker (hundreds of ms to
 * seconds per image) and must be measured in the browser. See
 * docs/PERFORMANCE.md for the recorded numbers and that caveat.
 *
 * Bounds are deliberately loose (no pathological blowup); the recorded
 * numbers live in docs/PERFORMANCE.md, not in the assertions.
 */
import { describe, it, expect } from 'vitest';
import { routeScan, DEFAULT_REVIEW_THRESHOLD } from './review';
import {
  verifyGateEventAgainstAppointment,
  type ScanInput,
} from './verify';
import {
  verifyScannedAgainstTasAppointment,
  appointmentContractToRef,
} from './tas-adapter';
import { checkDigitFor } from './iso6346';

const T = DEFAULT_REVIEW_THRESHOLD;

function validContainer(prefix10: string): string {
  return prefix10 + String(checkDigitFor(prefix10));
}

const TAS_PAYLOAD = {
  contractVersion: '1.0.0',
  appointment: {
    id: 'appt_01JPERF000000000000001',
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

/** Deterministic mixed batch: matches, mismatches, low-confidence reads. */
function makeBatch(n: number): ScanInput[] {
  const batch: ScanInput[] = [];
  for (let k = 0; k < n; k++) {
    const serial = String(100000 + ((k * 7919) % 899999)).padStart(6, '0');
    const container = validContainer('MSKU' + serial);
    const mode = k % 4;
    batch.push({
      plate: mode === 1 ? '99999-Z-99' : '48213-A-6',
      containerNumber: mode === 2 ? container : 'MSKU0000006',
      scannedAtUtc: '2026-10-17T10:00:00Z',
      gate: 'gate-1',
      containerConfidence: mode === 3 ? 42 : 92,
      plateConfidence: mode === 3 ? 55 : 88,
    });
  }
  return batch;
}

function bench(label: string, n: number, fn: () => void): number {
  fn(); // warmup (JIT, zod schema compilation)
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  const perSec = Math.round((n / ms) * 1000);
  // eslint-disable-next-line no-console
  console.log(
    `[perf] ${label}: ${n} ops in ${ms.toFixed(1)}ms ` +
      `(${(ms / n).toFixed(3)}ms/op, ${perSec.toLocaleString('en-US')}/s)`,
  );
  return ms;
}

describe('Phase D — verification pipeline throughput', () => {
  it('routes 1000 scans through routeScan', () => {
    const batch = makeBatch(1000);
    const ms = bench('routeScan x1000', 1000, () => {
      for (const s of batch) {
        const confidence = Math.min(s.containerConfidence, s.plateConfidence);
        routeScan({ error: null, confidence }, T);
      }
    });
    expect(ms).toBeLessThan(1000); // loose: pure function, ~µs each
  });

  it('verifies 100 and 1000 scans against an appointment ref', () => {
    const ref = {
      appointmentId: 'appt_01JPERF000000000000001',
      status: 'confirmed' as const,
      containerNumber: 'MSKU0000006',
      plate: '48213-A-6',
      slotStartUtc: '2026-10-17T09:00:00Z',
      slotEndUtc: '2026-10-17T11:00:00Z',
      gate: 'gate-1',
    };
    for (const n of [100, 1000]) {
      const batch = makeBatch(n);
      const ms = bench(`verifyGateEventAgainstAppointment x${n}`, n, () => {
        for (const s of batch) verifyGateEventAgainstAppointment(s, ref);
      });
      expect(ms).toBeLessThan(5000);
    }
  });

  it('runs 100 and 1000 scans through the full TAS seam (adapter + verifier)', () => {
    for (const n of [100, 1000]) {
      const batch = makeBatch(n);
      const ms = bench(`verifyScannedAgainstTasAppointment x${n}`, n, () => {
        for (const s of batch) verifyScannedAgainstTasAppointment(s, TAS_PAYLOAD);
      });
      expect(ms).toBeLessThan(15000); // loose: includes zod validation
    }
  });

  it('validates 1000 TAS payloads through appointmentContractToRef', () => {
    const ms = bench('appointmentContractToRef x1000', 1000, () => {
      for (let k = 0; k < 1000; k++) {
        const res = appointmentContractToRef(TAS_PAYLOAD);
        if (!res.ok) throw new Error('fixture payload must validate');
      }
    });
    expect(ms).toBeLessThan(15000);
  });
});
