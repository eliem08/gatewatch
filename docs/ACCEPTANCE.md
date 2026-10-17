# GateWatch — Acceptance Criteria for a Supervised Pilot

Phase D verdict: **the software is validated; the real world is not.**
Every criterion below is MET, NOT MET, or BLOCKED-ON-REAL-DATA, with the
evidence named. No criterion is marked MET on the basis of synthetic
data.

"Supervised pilot" means: fixed cameras at one or two real gate lanes,
every auto-accept still logged for operator spot-check, a human in the
review queue, no gate actuated by the software.

## Software correctness — MET

| # | Criterion | Status | Evidence |
|---|---|---|---|
| S1 | Zero auto-accepts across ≥500 hostile routing payloads (NaN/±Infinity/negative/>100 confidences, hostile error text, sub-threshold reads) | **MET** | `src/lib/fuzz-routing.test.ts` — 600 hostile payloads, 0 auto-accepts; benign reads still auto-accept (regression) |
| S2 | Zero authorizations across ≥500 hostile scans against a matching confirmed appointment (hostile confidences, mismatches, unicode confusables, overlong/empty strings) | **MET** | `src/lib/fuzz-routing.test.ts` — 500 hostile scans, 0 authorizations; hostile confidences → manual-review, identifier garbage → denied |
| S3 | Out-of-range confidence fails closed at every layer (the confidence-101 hole found and fixed in Phase D) | **MET** | Hardened `src/lib/review.ts` + `src/lib/verify.ts`; fuzz classes `above-100 confidence` cover both layers |
| S4 | 26 malformed TAS payload classes → typed issues, manual-review, never authorized, never throws | **MET** | `src/lib/tas-adversarial.test.ts` (58 tests) |
| S5 | Status-enum drift rejected at the adapter; all 6 contract statuses map to the documented decision | **MET** | `src/lib/tas-adversarial.test.ts` — drifted values (`CONFIRMED`, `checked_in`, `on-hold`, …) rejected; confirmed/checked-in → authorized, cancelled/completed/no-show → denied, requested → manual-review |
| S6 | ISO 6346 edge sweep: mod-11→10 branch, transposition behavior vs an independent modular oracle, blind spots pinned | **MET** | `src/lib/iso6346-edge.test.ts` — 25 prefixes hit the 10→0 branch; ~450 swaps agree with the oracle exactly; A↔K swaps and the 10→0 collision documented as valid-check-digit-≠-identity |
| S7 | Decision-pipeline throughput measured and recorded | **MET** | `docs/PERFORMANCE.md` — routeScan ~396k/s, verifier ~460k/s, full TAS seam ~3.5k/s (zod-bound) on 2 vCPU |
| S8 | Validation-dataset contract defined (versioned, provenance-labeled) | **MET** | `src/lib/datasets.ts` v1.0.0; `fixtures/synthetic/` validates against it |
| S9 | Replay limitation documented and test-locked (not fixed — no backend exists to fix it with) | **MET** | `src/lib/tas-adversarial.test.ts` — stale confirmed payload still authorizes, by design of the documented trust assumption |

## Real-world accuracy — BLOCKED-ON-REAL-DATA

| # | Criterion | Status | What's missing |
|---|---|---|---|
| R1 | Field accuracy (plate + container exact-match rate) measured on real gate captures | **BLOCKED-ON-REAL-DATA** | No labeled real captures exist. Needs a `real-terminal-capture` manifest per `src/lib/datasets.ts`: hundreds of frames, double-verified annotations, stratified across lighting/weather/angle. |
| R2 | CER/WER on real captures, split by capture-condition stratum | **BLOCKED-ON-REAL-DATA** | Same dataset as R1. The 4-SVG benchmark measures degradation robustness only. |
| R3 | Review-threshold operating point (precision/recall of the 70% cutoff on real reads) | **BLOCKED-ON-REAL-DATA** | Needs real OCR outputs paired with ground truth (R1 dataset + engine runs). The 70% default is an operator judgment call, not a tuned value. |
| R4 | End-to-end latency per truck on production hardware | **BLOCKED-ON-REAL-DATA** | Live Tesseract paths are mock-tested, never run live in this suite. Needs fixed cameras + the production preprocessing preset. Pipeline-only numbers exist (`docs/PERFORMANCE.md`) and show the decision code is not the bottleneck. |
| R5 | Appointment-match rate against live TAS data | **BLOCKED-ON-REAL-DATA** | Needs the production TAS seam (authenticated fresh fetch). |
| R6 | Accuracy on Arabic-script plates | **BLOCKED-ON-REAL-DATA** | Parser supports Latin-script formats only; Arabic series letters need an `ara.traineddata` engine + labeled captures. Unsupported plates route to human review today. |

No pass/fail thresholds are set for R1–R6 — thresholds are a joint
decision with the terminal operator once measurements exist. Setting
them now, against no data, would be manufacturing a bar.

## Known gaps — NOT MET (by design, this phase)

| # | Criterion | Status | Note |
|---|---|---|---|
| G1 | Replay attack on the TAS seam closed | **NOT MET** | Shape validation only; needs authenticated per-scan fresh fetch (production seam). Test-locked as a documented limitation. |
| G2 | Server-side storage, audit trail, access control | **NOT MET** | localStorage is DEMO-ONLY (labeled everywhere). Production needs a server store; no backend is built in this phase by design. |
| G3 | Arabic-script plate support | **NOT MET** | See R6. Parser never guesses; unsupported → human review. |

## Reading this table

- **MET** items are proven by tests you can run (`npm test`).
- **BLOCKED-ON-REAL-DATA** items name the exact artifact that would
  unblock them — in every case, a data-collection effort with the
  terminal operator, contracted by `src/lib/datasets.ts`.
- Nothing in the MET column says anything about how well the system
  reads real plates. That is the entire point of Phase D.
