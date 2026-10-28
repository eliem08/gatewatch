# GateWatch — Known Limitations Registry

Frank list, each with the evidence and what would resolve it. Updated
in Phase D (2026-10-18). Items marked RESOLVED were fixed and
test-locked in this phase.

## 1. No real-world accuracy data — NOTHING HERE MEASURES IT

**Status:** open, BLOCKED-ON-REAL-DATA.
**Evidence:** the benchmark scores 4 synthetic SVG renders;
`src/lib/ocr.ts` paths are mock-tested; `fixtures/synthetic/` is
fabricated. Stated in `src/lib/datasets.ts`, `docs/ACCEPTANCE.md`,
and every fixture README.
**Resolving evidence:** a `real-terminal-capture` manifest conforming
to `GateValidationDatasetSchema` v1.0.0 — hundreds of labeled frames,
double-verified, stratified across lighting/weather/angle — collected
with the terminal operator. The contract exists; the collection has not
started.

## 2. Replay attack on the TAS seam

**Status:** open, documented, test-locked — NOT fixed.
**Evidence:** `src/lib/tas-adapter.ts` ("CROSS-SYSTEM TRUST
ASSUMPTION"); `src/lib/tas-adversarial.test.ts` proves a stale
well-formed `confirmed` payload still authorizes, and that the seam is
stateless (duplicates decide identically; conflicts resolve
per-payload). The adapter validates shape, not provenance.
**Resolving evidence:** a production seam — authenticated (TLS +
service identity) per-scan fresh fetch, authorized by the real
`AuthProvider` (not the dev mock), with TAS-side cancellation
propagating before the next scan. No backend is built in this phase by
design.

## 3. Demo-only storage (localStorage), no server, no access control

**Status:** open, by design this phase.
**Evidence:** README "Honest limitations"; every record labeled
DEMO-ONLY; `gatewatch.log.v1` / `gatewatch.review.v1` /
`gatewatch.slots.v1` live in the visitor's browser. Anyone with
devtools can read or rewrite every record.
**Resolving evidence:** server-side store synced from the TOS with an
append-only audit trail. Versioned contracts (`contracts.ts`) already
validate-and-quarantine on load; they are format discipline, not
security infrastructure.

## 4. Plate-format coverage: Latin script only

**Status:** open.
**Evidence:** `src/lib/plates.ts`; README "Honest limitations".
Supported: `NNNNN-L-NN` Latin series (incl. 2-letter series), WW
temporary plates both orders, demo-only Latin region suffix. NOT
supported: Arabic-script series letters (the majority of plates on
Moroccan roads), the `MA |` country-code prefix, W18 dealer plates, CD
diplomatic, government `M`/`ج`, trailer plates, pre-2000 formats.
**Resolving evidence:** an `ara.traineddata` engine + labeled captures
of Arabic-script plates (see limitation 1). Anything unsupported
routes to human review today; the parser never guesses.

## 5. Check-digit blind spots — valid check digit ≠ identity

**Status:** open, inherent to ISO 6346, test-pinned.
**Evidence:** `src/lib/iso6346-edge.test.ts` proves against an
independent modular oracle: letter pairs congruent mod 11 (A=10/K=21/
U=32, K/U in MSKU, …) survive transposition and substitution; the
10→0 mapping lets a transposition escape on check-digit-0 numbers
(`MSKU0000310` ↔ `MSKU0003010` both validate). A correct check digit
is a typo trap, not proof the container exists.
**Resolving evidence:** none needed at the math layer — identity is
established by matching the appointment record (TAS seam), never by
the check digit alone. The backstop is architectural, and it is tested.

## 6. Submission schema v1.0.0 has no blank-string rule

**Status:** open, minor, test-pinned.
**Evidence:** `src/lib/fuzz-routing.test.ts` ("documents the schema
boundary"): whitespace-only / NUL-containing / overlong identifiers
pass `GateScanSubmissionSchema` (no blank rule, no max length), but the
verifier denies every one of them — never authorizes. Schema is
syntax; the verifier is semantics.
**Resolving evidence:** a contract v1.1.0 adding a blank-string /
max-length rule at the ingestion boundary (rejected today only
downstream).

## 7. Lanes share one OCR engine; review thumbnails are session-bound

**Status:** open, demo architecture.
**Evidence:** README "Honest limitations". Batch items serialize
through one in-browser Tesseract worker; lane assignment and per-lane
stats are real but not parallel. Uploaded-image review thumbnails die
on reload (object URLs); decided history survives.
**Resolving evidence:** production lanes each run their own reader;
persistent thumbnail store server-side.

## 8. Confidence >100 auto-accepted — RESOLVED in Phase D

**Status:** resolved, test-locked.
**Evidence:** found by adversarial fuzz: a finite confidence of 101
passed both `routeScan` and `verifyGateEventAgainstAppointment`
(`101 < 70` is false; `ocr.ts` coerces non-finite to 0 but never
clamps >100, so the hole was reachable from a hostile worker). Now
out-of-range confidence fails closed to human-review/manual-review in
both layers. Covered by the `above-100 confidence` fuzz classes and
the hostile-confidence verifier fuzz.

## 9. Non-finite confidence auto-accept — RESOLVED (Phase B, re-locked)

**Status:** resolved, test-locked.
**Evidence:** `needsReview` returns true for NaN/±Infinity
(`NaN < threshold` is false — the original silent-auto-accept bug);
re-fuzzed in Phase D across 200 hostile confidences.

## 10. Estimates, not guarantees

**Status:** standing caveat.
**Evidence:** the 9× ROI figure is arithmetic on 180 s vs 20 s checks,
not a measured deployment. Throughput numbers in
`docs/PERFORMANCE.md` are decision-pipeline-only on a 2-vCPU dev VM;
they do not include OCR latency, which dominates the real loop and is
unmeasured here.


## Security, dependencies and production readiness (verified 2026-10-28)

**Dependency audit.** `npm audit` reports 0 vulnerabilities (all severities) on the lockfile at the commit that introduced this section. CI runs `npm audit --audit-level=high` as a **blocking** step with **no exceptions**; a second step prints the full report. If an unfixable advisory ever has to be tolerated, it must be listed here with advisory ID, affected environment, mitigation, expiry and follow-up, and gated by ID in CI, not by turning the audit into a warning.

**Not production-ready.** A green CI run is not evidence of production readiness. Missing before any real deployment: real-data validation, a durable shared store, a real identity provider with verified credentials, operational monitoring, backup/recovery, and an authorized staging validation. Nothing in this repository has been connected to a real port, TOS, gate controller or production service.

**Feature status.**

| Feature | Status |
|---|---|
| Container/plate validation, OCR confidence thresholds, manual-review flow, TAS seam checks | Implemented and tested (289 tests, including fuzz) against **synthetic** inputs only |
| Storage | Browser `localStorage` only: no server, no durability, no multi-user consistency |
| Authentication | `DevMockAuthProvider` is a client-side, library-level mock with no HTTP surface; it trusts whatever role it was constructed with. A real provider is a placeholder. OCR output alone never authorizes entry; a supervisor decision is required to move manual-review to authorized. |
| Real-world OCR accuracy | **Unmeasured.** Synthetic benchmark images say nothing about real gate accuracy. |
