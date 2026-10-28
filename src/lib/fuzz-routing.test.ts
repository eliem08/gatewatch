/**
 * Phase D — adversarial OCR fuzz: the safety invariant under fire.
 *
 * Mission: separate software correctness from real-world accuracy.
 * No matter how hostile the OCR payload — corrupt worker messages,
 * NaN/Infinity confidences, out-of-range scores, empty or overlong
 * strings, unicode confusables, mismatched identifier pairs — the
 * verdict choke point must NEVER auto-accept, and the verifier must
 * NEVER authorize. Failed/low-confidence reads fail closed:
 * 'human-review' or 'scan-failed' at the routing layer,
 * 'manual-review' or 'denied' at the verification layer.
 *
 * Deterministic: mulberry32 with a fixed seed, so failures reproduce.
 * This is a SOFTWARE-correctness suite — it says nothing about how well
 * Tesseract reads real gate photos (see docs/ACCEPTANCE.md).
 */
import { describe, it, expect } from 'vitest';
import {
  routeScan,
  needsReview,
  DEFAULT_REVIEW_THRESHOLD,
  type ScanRouting,
} from './review';
import {
  verifyGateEventAgainstAppointment,
  REASON_CODES,
  type ScanInput,
} from './verify';
import {
  AUTH_CONFIDENCE_THRESHOLD,
  GateScanSubmissionSchema,
  GateVerificationEventSchema,
  type AppointmentRef,
} from './contracts';
import { checkDigitFor } from './iso6346';

const T = DEFAULT_REVIEW_THRESHOLD;
const SEED = 0x6a743c; // fixed for reproducibility

/** mulberry32 — small seeded PRNG, no dependency. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <A>(rand: () => number, xs: A[]): A =>
  xs[Math.floor(rand() * xs.length)];

const randRange = (rand: () => number, lo: number, hi: number): number =>
  lo + rand() * (hi - lo);

/** log-uniform in [10^loExp, 10^hiExp] — reaches extreme magnitudes fast. */
const randLogRange = (rand: () => number, loExp: number, hiExp: number): number =>
  Math.pow(10, randRange(rand, loExp, hiExp));

/** A valid ISO 6346 number, computed (never hardcoded-fragile). */
function validContainer(prefix10: string): string {
  return prefix10 + String(checkDigitFor(prefix10));
}

const GOOD_CONTAINER = validContainer('MSKU739201');
const GOOD_PLATE = '78452-A-17';
const SLOT_START = '2026-10-20T08:00:00Z';
const SLOT_END = '2026-10-20T12:00:00Z';

const CONFIRMED_REF: AppointmentRef = {
  appointmentId: 'appt_fuzzref01',
  status: 'confirmed',
  containerNumber: GOOD_CONTAINER,
  plate: GOOD_PLATE,
  slotStartUtc: SLOT_START,
  slotEndUtc: SLOT_END,
  gate: 'G1',
};

function matchingScan(over: Partial<ScanInput> = {}): ScanInput {
  return {
    plate: GOOD_PLATE,
    containerNumber: GOOD_CONTAINER,
    scannedAtUtc: '2026-10-20T09:30:00Z',
    gate: 'G1',
    containerConfidence: 95,
    plateConfidence: 95,
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * PART A — routeScan fuzz: N hostile routing payloads, zero auto-accepts
 * ------------------------------------------------------------------ */

const ROUTE_FUZZ_PER_CLASS = 100;

type RoutePayload = { error: string | null; confidence: number };

function hostileRoutePayloads(): { name: string; payloads: RoutePayload[] }[] {
  const rand = mulberry32(SEED);
  const nonFinite: RoutePayload[] = [];
  const negative: RoutePayload[] = [];
  const aboveRange: RoutePayload[] = [];
  const subThreshold: RoutePayload[] = [];
  const errorBeatsAll: RoutePayload[] = [];
  const hostileErrorText: RoutePayload[] = [];
  const benign: RoutePayload[] = [];

  const errorStrings = [
    'OCR engine failed to load',
    'Could not decode that image.',
    'worker crashed mid-pass',
    '⛔ engine says no', // unicode in an error message
    'x'.repeat(5000), // absurdly long error
    '\u0000', // NUL byte
  ];
  const hostileConfidences = [
    NaN,
    Infinity,
    -Infinity,
    -101,
    100.0001,
    101,
    1e9,
  ];

  for (let i = 0; i < ROUTE_FUZZ_PER_CLASS; i++) {
    // 1. Non-finite confidences (the original NaN lesson, fuzzed).
    nonFinite.push({
      error: null,
      confidence: pick(rand, [NaN, Infinity, -Infinity]),
    });
    // 2. Negative confidences.
    negative.push({ error: null, confidence: -randLogRange(rand, -6, 3) });
    // 3. Above the contractual 0–100 scale (Phase D hardening — these used
    //    to sail through to auto-accept; now they must fail closed).
    aboveRange.push({
      error: null,
      confidence: 100 + randLogRange(rand, -9, 4),
    });
    // 4. Ordinary sub-threshold reads.
    subThreshold.push({ error: null, confidence: randRange(rand, 0, 69.9999) });
    // 5. An error beats ANY confidence — even 100, even corrupt ones.
    errorBeatsAll.push({
      error: pick(rand, errorStrings),
      confidence: pick(rand, [...hostileConfidences, 0, 70, 100]),
    });
    // 6. Hostile error text with a mid confidence — still scan-failed.
    hostileErrorText.push({
      error: pick(rand, errorStrings),
      confidence: randRange(rand, 40, 99),
    });
    // 7. Benign reads — the happy path must keep auto-accepting after the
    //    Phase D hardening (regression guard, NOT part of the hostile set).
    benign.push({ error: null, confidence: randRange(rand, 70, 100) });
  }

  return [
    { name: 'non-finite confidence', payloads: nonFinite },
    { name: 'negative confidence', payloads: negative },
    { name: 'above-100 confidence', payloads: aboveRange },
    { name: 'sub-threshold confidence', payloads: subThreshold },
    { name: 'error beats any confidence', payloads: errorBeatsAll },
    { name: 'hostile error text', payloads: hostileErrorText },
    { name: 'benign clean reads (regression)', payloads: benign },
  ];
}

describe('Phase D — adversarial fuzz on the verdict choke point', () => {
  it('routes every hostile payload to human-review or scan-failed — never auto-accept', () => {
    const classes = hostileRoutePayloads();
    let hostileCount = 0;
    let autoAccepts = 0;
    const verdictsSeen = new Set<ScanRouting>();

    for (const cls of classes) {
      const isBenign = cls.name.startsWith('benign');
      for (const p of cls.payloads) {
        const verdict = routeScan(p, T);
        verdictsSeen.add(verdict);
        if (isBenign) {
          expect(verdict).toBe('auto-accept');
        } else {
          hostileCount += 1;
          if (verdict === 'auto-accept') autoAccepts += 1;
          expect(['human-review', 'scan-failed']).toContain(verdict);
        }
      }
    }

    expect(hostileCount).toBeGreaterThanOrEqual(500);
    expect(autoAccepts).toBe(0);
    // The choke point still has exactly three outcomes — no hidden path.
    expect(verdictsSeen).toEqual(
      new Set(['human-review', 'scan-failed', 'auto-accept']),
    );
  });

  it('needsReview fails closed on every hostile confidence class', () => {
    const rand = mulberry32(SEED ^ 0xdead);
    const hostile: number[] = [];
    for (let i = 0; i < 200; i++) {
      hostile.push(
        pick(rand, [NaN, Infinity, -Infinity, -randLogRange(rand, -6, 3), 100 + randLogRange(rand, -9, 4)]),
      );
    }
    expect(hostile.length).toBe(200);
    for (const c of hostile) {
      expect(needsReview(c, T)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * PART B — verifier fuzz: hostile scans never authorize against a
 * perfectly matching, confirmed appointment.
 * ------------------------------------------------------------------ */

const VERIFY_FUZZ_PER_CLASS = 100;

const UNICODE_CONFUSABLES = [
  'ΜSKU7392017', // Greek Mu (U+039C) for Latin M
  'MSKU73920１7', // fullwidth digit 1
  'МSKU7392017', // Cyrillic Em (U+041C) for Latin M
  '78452-А-17', // Cyrillic A in the plate
  '𝟟𝟠𝟜𝟝𝟚-A-17', // mathematical bold digits
  'MSKU7392017​', // zero-width space appended
];

function hostileScans(): { name: string; scans: ScanInput[] }[] {
  const rand = mulberry32(SEED ^ 0xbeef);
  const hostileConf: ScanInput[] = [];
  const mismatched: ScanInput[] = [];
  const confusable: ScanInput[] = [];
  const overlong: ScanInput[] = [];
  const empty: ScanInput[] = [];

  for (let i = 0; i < VERIFY_FUZZ_PER_CLASS; i++) {
    // 1. Hostile confidences on an otherwise PERFECT scan — a shaky read
    //    must never authorize, however well the identifiers match.
    hostileConf.push(
      matchingScan({
        containerConfidence: pick(rand, [
          NaN,
          Infinity,
          -Infinity,
          -randLogRange(rand, -6, 2),
          100 + randLogRange(rand, -9, 2),
          randRange(rand, 0, AUTH_CONFIDENCE_THRESHOLD - 0.01),
        ]),
        plateConfidence: pick(rand, [
          NaN,
          Infinity,
          -Infinity,
          -randLogRange(rand, -6, 2),
          100 + randLogRange(rand, -9, 2),
          randRange(rand, 0, AUTH_CONFIDENCE_THRESHOLD - 0.01),
        ]),
      }),
    );
    // 2. Valid-format but non-matching identifiers — must deny, not defer.
    //    (rejection-sampled so the fuzz never accidentally hits the true pair)
    let wrongContainer = validContainer(
      'MSKU' + String(100000 + Math.floor(rand() * 899999)),
    );
    while (wrongContainer === GOOD_CONTAINER) {
      wrongContainer = validContainer(
        'MSKU' + String(100000 + Math.floor(rand() * 899999)),
      );
    }
    let wrongPlate = `${10000 + Math.floor(rand() * 89999)}-Z-${10 + Math.floor(rand() * 89)}`;
    while (wrongPlate === GOOD_PLATE) {
      wrongPlate = `${10000 + Math.floor(rand() * 89999)}-Z-${10 + Math.floor(rand() * 89)}`;
    }
    mismatched.push(
      matchingScan({ containerNumber: wrongContainer, plate: wrongPlate }),
    );
    // 3. Unicode confusables — look right, are not right; must deny.
    confusable.push(
      matchingScan({
        containerNumber: pick(rand, UNICODE_CONFUSABLES.slice(0, 3).concat([UNICODE_CONFUSABLES[5]])),
        plate: pick(rand, UNICODE_CONFUSABLES.slice(3, 5)),
      }),
    );
    // 4. Overlong strings — cannot match, must deny (never authorize).
    overlong.push(
      matchingScan({
        containerNumber: GOOD_CONTAINER.repeat(1 + Math.floor(rand() * 40)),
        plate: GOOD_PLATE.repeat(1 + Math.floor(rand() * 40)),
      }),
    );
    // 5. Empty strings — must deny, never authorize.
    empty.push(matchingScan({ containerNumber: '', plate: '' }));
  }

  return [
    { name: 'hostile confidences on matching scan', scans: hostileConf },
    { name: 'mismatched identifiers', scans: mismatched },
    { name: 'unicode confusables', scans: confusable },
    { name: 'overlong strings', scans: overlong },
    { name: 'empty strings', scans: empty },
  ];
}

describe('Phase D — adversarial fuzz on the verifier', () => {
  it('never authorizes a hostile scan against a matching confirmed appointment', () => {
    const classes = hostileScans();
    let total = 0;
    let authorized = 0;

    for (const cls of classes) {
      for (const scan of cls.scans) {
        total += 1;
        const { decision, reasonCodes } = verifyGateEventAgainstAppointment(
          scan,
          CONFIRMED_REF,
        );
        if (decision === 'authorized') authorized += 1;
        expect(decision).not.toBe('authorized');

        if (cls.name === 'hostile confidences on matching scan') {
          expect(decision).toBe('manual-review');
          expect(
            reasonCodes.includes(REASON_CODES.LOW_CONTAINER_CONFIDENCE) ||
              reasonCodes.includes(REASON_CODES.LOW_PLATE_CONFIDENCE),
          ).toBe(true);
        } else {
          // Identifier garbage denies (mismatch), it does not defer.
          expect(decision).toBe('denied');
          expect(
            reasonCodes.includes(REASON_CODES.CONTAINER_MISMATCH) ||
              reasonCodes.includes(REASON_CODES.PLATE_MISMATCH),
          ).toBe(true);
        }
      }
    }

    expect(total).toBeGreaterThanOrEqual(500);
    expect(authorized).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * PART C — schema fuzz: the ingestion boundary rejects hostile
 * submissions; the event contract refuses 'authorized' without
 * threshold confidences (defense in depth behind routeScan/verify).
 * ------------------------------------------------------------------ */

describe('Phase D — adversarial fuzz on the contract boundaries', () => {
  it('GateScanSubmissionSchema rejects hostile confidences and empty identifiers', () => {
    const rand = mulberry32(SEED ^ 0xf00d);
    const hostile: unknown[] = [];
    const hostileConfidences = [
      NaN,
      Infinity,
      -Infinity,
      -1,
      -1e9,
      100.0001,
      101,
      1e12,
    ];
    for (let i = 0; i < 120; i++) {
      const base = {
        scannedAtUtc: '2026-10-20T09:30:00Z',
        gateId: 'G1',
        direction: 'in',
        plate: GOOD_PLATE,
        containerNumber: GOOD_CONTAINER,
        containerConfidence: 95,
        plateConfidence: 95,
        engine: 'tesseract',
      };
      const pickClass = i % 4;
      if (pickClass === 0)
        hostile.push({
          ...base,
          containerConfidence: pick(rand, hostileConfidences),
        });
      else if (pickClass === 1)
        hostile.push({
          ...base,
          plateConfidence: pick(rand, hostileConfidences),
        });
      else if (pickClass === 2) hostile.push({ ...base, plate: '' });
      else hostile.push({ ...base, containerNumber: '' });
    }

    expect(hostile.length).toBe(120);
    for (const payload of hostile) {
      expect(GateScanSubmissionSchema.safeParse(payload).success).toBe(false);
    }
  });

  it('documents the schema boundary: blank/overlong strings are schema-accepted but never authorize', () => {
    // GateScanSubmissionSchema v1.0.0 has no blank-string rule and no max
    // length — whitespace-only, NUL-containing, and overlong identifiers
    // PASS the schema. This test pins the honest layering: the schema is
    // syntax-only, and the verifier (semantics) must still never
    // authorize such scans. A future contract version may reject blanks
    // at the boundary; see docs/LIMITATIONS.md.
    const rand = mulberry32(SEED ^ 0xb1a4);
    const blanks = ['', '   ', '\u0000', '\u0000\u0000', '\t \n'];
    const acceptedBySchema: { plate: string; containerNumber: string }[] = [];
    for (let i = 0; i < 100; i++) {
      const blank = pick(rand, blanks);
      const payload = {
        scannedAtUtc: '2026-10-20T09:30:00Z',
        gateId: 'G1',
        direction: 'in',
        plate: rand() < 0.5 ? blank : GOOD_PLATE,
        containerNumber: rand() < 0.5 ? GOOD_CONTAINER.repeat(40) : blank,
        containerConfidence: 95,
        plateConfidence: 95,
        engine: 'tesseract',
      };
      const parsed = GateScanSubmissionSchema.safeParse(payload);
      if (parsed.success) {
        acceptedBySchema.push({
          plate: payload.plate,
          containerNumber: payload.containerNumber,
        });
      }
    }
    // Some of these DO pass the schema (no blank rule) — the invariant
    // that matters is downstream: the verifier denies every one of them.
    expect(acceptedBySchema.length).toBeGreaterThan(0);
    for (const payload of acceptedBySchema) {
      const { decision } = verifyGateEventAgainstAppointment(
        matchingScan({
          plate: payload.plate,
          containerNumber: payload.containerNumber,
        }),
        CONFIRMED_REF,
      );
      expect(decision).toBe('denied');
    }
  });

  it('GateVerificationEventSchema refuses "authorized" with sub-threshold confidences', () => {
    const rand = mulberry32(SEED ^ 0xc0de);
    const hostile: unknown[] = [];
    for (let i = 0; i < 60; i++) {
      hostile.push({
        id: `evt-${i}`,
        scannedAtUtc: '2026-10-20T09:30:00Z',
        gateId: 'G1',
        direction: 'in',
        vehicle: { plate: GOOD_PLATE },
        container: { number: GOOD_CONTAINER, checkDigitValid: true },
        ocr: {
          containerConfidence: randRange(rand, 0, 69.9),
          plateConfidence: randRange(rand, 0, 69.9),
          engine: 'tesseract',
        },
        appointmentRef: {
          appointmentId: 'appt_fuzzref01',
          contractVersion: '1.0.0',
        },
        decision: 'authorized',
        decidedBy: 'op-1',
        reasonCodes: ['verified-match'],
      });
    }

    expect(hostile.length).toBe(60);
    for (const payload of hostile) {
      expect(GateVerificationEventSchema.safeParse(payload).success).toBe(false);
    }

    // And a well-formed authorized event still passes (regression).
    const good = {
      id: 'evt-good',
      scannedAtUtc: '2026-10-20T09:30:00Z',
      gateId: 'G1',
      direction: 'in',
      vehicle: { plate: GOOD_PLATE },
      container: { number: GOOD_CONTAINER, checkDigitValid: true },
      ocr: {
        containerConfidence: 95,
        plateConfidence: 95,
        engine: 'tesseract',
      },
      appointmentRef: {
        appointmentId: 'appt_fuzzref01',
        contractVersion: '1.0.0',
      },
      decision: 'authorized',
      decidedBy: 'op-1',
      reasonCodes: ['verified-match'],
    };
    expect(GateVerificationEventSchema.safeParse(good).success).toBe(true);
  });
});
