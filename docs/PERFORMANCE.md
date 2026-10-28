# GateWatch — Verification Pipeline Performance

Measured 2026-10-18 (Africa/Casablanca) on the dev VM: Node v24.20.0,
2 vCPU (AMD EPYC 9D25), via `npx vitest run src/lib/performance.test.ts`
(single warmup pass, then timed; deterministic mixed batches of
matches / mismatches / low-confidence reads).

## Measured throughput (decision pipeline only)

| Stage | Batch | Time | Per op | Throughput |
|---|---|---|---|---|
| `routeScan` (verdict choke point) | 1,000 | 2.5 ms | 0.003 ms | ~396,000/s |
| `verifyGateEventAgainstAppointment` | 100 | 0.3 ms | 0.003 ms | ~391,000/s |
| `verifyGateEventAgainstAppointment` | 1,000 | 2.2 ms | 0.002 ms | ~460,000/s |
| Full TAS seam (`verifyScannedAgainstTasAppointment`) | 100 | 21.0 ms | 0.210 ms | ~4,800/s |
| Full TAS seam (`verifyScannedAgainstTasAppointment`) | 1,000 | 287.6 ms | 0.288 ms | ~3,500/s |
| `appointmentContractToRef` (zod validation) | 1,000 | 249.5 ms | 0.250 ms | ~4,000/s |

## What the numbers mean

- **The decision pipeline is not the bottleneck.** Pure routing and
  verification run at hundreds of thousands of ops/sec. The TAS seam is
  ~100× slower than the bare verifier, and the cost is almost entirely
  zod schema validation of the appointment payload (~0.25 ms/op) — the
  price of the shape-not-provenance contract boundary, and a cheap one.
- **OCR dominates real latency by orders of magnitude.** A single gate
  image through the in-browser Tesseract worker costs hundreds of
  milliseconds to seconds (preprocessing + up to 4 PSM passes in ensemble
  mode). The numbers above cover everything *after* the OCR read lands.
- **Scaling reading:** at ~3,500 full-seam verifications/sec on 2 vCPU,
  the pipeline could verify every truck through a 3-lane gate for a year
  in minutes. Any production latency budget goes to image capture,
  preprocessing, and the OCR engine — not to this code.

## What was NOT measured (labeled, not hidden)

- **Live Tesseract OCR latency.** The browser-executed OCR paths are
  unit-tested with mocks in this suite and never run live here; the demo
  UI reports per-scan ms in the browser, but no controlled OCR benchmark
  on real gate hardware exists. Any "X seconds per truck" claim for the
  full loop would need: fixed camera hardware, the production
  preprocessing preset, and labeled captures — i.e. the real-world
  dataset defined in `src/lib/datasets.ts`, which does not exist yet.
- **Concurrent / multi-lane contention.** These are single-threaded,
  sequential measurements. The demo's 3 lanes share one browser OCR
  worker (documented in the README); true lane parallelism is a
  production-deployment property.
- **Cold start.** Timed runs follow one warmup pass; first-call zod
  schema compilation and JS JIT are excluded.

## Reproducing

```bash
npx vitest run src/lib/performance.test.ts
```

The test asserts only loose no-blowup bounds (< 1 s for 1,000 routeScans,
< 15 s for 1,000 full-seam verifications); the numbers above are printed
to stdout on every run (`[perf]` lines), not baked into assertions, so
they stay honest on any machine.
