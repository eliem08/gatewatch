# GateWatch — AI Gate Automation for Ports

**Computer vision at the terminal gate: read every plate and container number, verify it against the appointment slot, and clear the truck in ~20 seconds instead of ~3 minutes.**

GateWatch is a working demo of an automated gate pipeline, built around the real bottleneck at the **Port of Casablanca**: just **3 terminal gates**, trucks queuing **up to 12 hours**, and throughput collapsed from ~2,800 to ~900 containers/day. Manual plate-and-container checks take minutes per truck. GateWatch turns that check into seconds — no new concrete required.

> **Live demo:** https://gatewatch-8cj6b60eq-eliem08s-projects.vercel.app

---

## The problem

Casablanca handles ~65% of Morocco's foreign trade. Its landside crisis has five interlocking causes — but the gate is the one chokepoint every truck must pass:

| Factor | Reality |
|---|---|
| Gates | 3 manual checkpoints for the whole terminal |
| Verification | Plate + container number read by eye, ~3 min/truck |
| Peak waits | Up to 12 hours for trucks |
| Throughput | ~2,800 → ~900 containers/day |

You can't pour concrete fast enough. You can automate the check.

## The ROI math

| Metric | Manual gate | GateWatch |
|---|---|---|
| Verification time | ~180 s | ~20 s |
| Trucks / hour / gate | ~20 | ~180 |
| 3-gate throughput | ~60/hr | ~540/hr |
| Read errors | Manual, disputed | ISO 6346 check-digit validated |
| Audit trail | Paper / memory | Every crossing timestamped + logged |

**≈9× gate throughput without building a fourth gate.** Faster gates also cut truck idling (fuel + CO₂), demurrage disputes (every read is logged with a timestamp), and the queue spilling onto city roads.

*Engineering estimates for the demo (180 s manual vs 20 s automated). Real-world throughput also depends on yard and customs capacity downstream.*

## How it works

```
 ┌─────────┐    ┌─────────────┐    ┌──────┐    ┌──────────┐    ┌────────┐    ┌─────┐
 │ Camera  │───▶│ Preprocess  │───▶│ OCR  │───▶│ Validate │───▶│ Verify │───▶│ Log │
 │(gate)   │    │(grayscale,  │    │(Tess-│    │(ISO 6346 │    │(slot   │    │(dash│
 │         │    │ contrast,   │    │eract │    │ check    │    │registry│    │board)│
 │         │    │ 2× upscale) │    │.js)  │    │ digit)   │    │)      │    │     │
 └─────────┘    └─────────────┘    └──────┘    └──────────┘    └────────┘    └─────┘
```

```mermaid
flowchart LR
    CAM[Gate camera] --> PRE[Preprocess\ncanvas: grayscale, contrast stretch, 2x upscale]
    PRE --> OCR[Tesseract.js OCR\nin-browser, PSM sparse text]
    OCR --> PLATE{Plate found?}
    PLATE -- No --> CROP[Crop lower band\nsecond OCR pass]
    CROP --> EXTRACT
    PLATE -- Yes --> EXTRACT[Extract candidates\nregex + normalize]
    EXTRACT --> ISO[ISO 6346 validation\ncheck-digit verify]
    ISO --> SLOT[Slot registry lookup\nplate + container + time window]
    SLOT -->|match| GREEN[Barrier lifts]
    SLOT -->|mismatch / no-slot| RED[Hold for inspection]
    GREEN --> LOG[Gate log + dashboard]
    RED --> LOG
```

### The two-pass OCR trick

Plates sit low in gate-camera frames, and page-level layout analysis routinely skips them. GateWatch runs OCR on the full frame, and **if no plate candidate is found, it automatically re-scans the lower 45% as a second pass** — the same approach real ANPR deployments use with a dedicated plate camera. Container numbers follow **ISO 6346** (4 letters + 6 digits + check digit); the check digit is validated per the standard, so misreads are caught, not trusted.

Everything runs **in the browser** (Tesseract.js, no server GPU, no image uploads) — it deploys on existing gate-camera hardware with a static host.

## App tour

- **`/`** — Marketing landing: the problem, the ROI math, how it works. This is the sales pitch.
- **`/demo`** — Guided live demo: pick a sample capture (or upload a truck photo) → watch OCR + preprocessing → review extracted plate/container with ISO 6346 validation → verify against the slot registry → log the crossing.
- **`/batch`** — Batch mode: drop many gate captures at once. Each image is assigned to one of 3 lanes and scanned in queue order; reads below the operator-set confidence threshold go to the human review queue instead of auto-accepting. Verified results land in the gate log in order.
- **`/dashboard`** — Operations view: gate log, trucks/hour, avg check time, mismatch rate, hourly throughput chart, outcome donut, per-lane throughput, OCR accuracy panel (auto-accept rate, correction rate), and one-click CSV export of the gate log. "Load sample shift" fills a realistic day.
- **`/registry`** — Appointment-slot CRUD (plate, container, company, line, gate, time window). Persists in `localStorage`; reset to demo data anytime.

## Batch mode, review queue & lanes

**Batch processing.** Drag-and-drop or browse for many images at once (or "Add all 4 samples"). Items process strictly in queue order with per-image status (`queued → processing → done / failed`) and a progress bar. A failed scan never blocks the queue — the next item starts immediately.

**Human review queue.** Every scan whose OCR confidence falls below the operator-set threshold (default 70%, adjustable) is routed to review instead of auto-accepting. The operator sees the capture, the OCR read, and editable plate/container fields, then approves as-is or saves a correction. Every decision is recorded: the dashboard's accuracy panel reports the auto-accept rate (scans that never needed a human) and the correction rate (reviewed reads the operator actually changed).

**3 lane simulation.** Each batch item is assigned to the least-loaded of 3 lanes (ties → lowest lane number) when processing starts; each lane tracks its own processed count and average scan time, and the dashboard shows per-lane throughput. The lanes share one browser OCR engine in this demo, so scans serialize in queue order — production lanes each run their own reader.

**CSV export.** The dashboard's "Export CSV" button downloads the gate log (`timestamp,image,plate,container,iso_valid,result,gate,lane,processing_ms,reviewed,corrected`), oldest-first, RFC 4180 escaping.

**Moroccan plate coverage.** Beyond the current `NNNNN-L-NN` series, the parser accepts 2-letter series (`78452-AB-17`, used once single letters ran out), WW temporary plates in both orders (`WW-123456`, `123456-WW`), and an optional region suffix using the Latin transliteration codes from export/transit paperwork (`78452-A-17-CAS`, `…-RAB`, `…-FES`, 35 city codes). Only known region codes count as a suffix — any other trailing word is treated as OCR noise.

## Sample images

`public/samples/` contains 4 synthetic gate-camera captures (1400×875 SVG, text as vector paths — renders identically everywhere) with valid ISO 6346 numbers and Moroccan-format plates:

| File | Container | Plate |
|---|---|---|
| `sample-1-tclu.svg` | TCLU 482913-2 | — |
| `sample-2-msku.svg` | MSKU 739201-7 | 78452-A-17 |
| `sample-3-gesu.svg` | GESU 556720-2 | — |
| `sample-4-fciu.svg` | FCIU 908134-3 | 91208-B-45 |

They're renders, not photos — built for OCR reliability so the demo works on first click. The matching appointment slots are pre-seeded in the registry.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest — 53 tests
npm run build    # production build
```

Deploys as-is on Vercel (`npm run build` / `next start`).

## Project structure

```
src/
  app/
    page.tsx            # landing (the pitch)
    demo/page.tsx       # guided OCR + verification demo
    batch/page.tsx      # batch queue, 3 lanes, human review queue, accuracy
    dashboard/page.tsx  # gate log, stats, lane + accuracy panels, CSV export
    registry/page.tsx   # slot CRUD
  components/           # Navbar, Footer, UploadZone, BatchDropzone, StepIndicator, ui primitives
  lib/
    ocr.ts              # Tesseract.js wrapper, preprocessing, region re-scan
    iso6346.ts          # check-digit math, parsing, candidate extraction
    plates.ts           # Moroccan plate normalization (2-letter series, WW, region codes)
    slots.ts            # slot matching (match / mismatch / no-slot / outside-window)
    registry.ts         # seed data + localStorage
    gatelog.ts          # log types + statistics
    batch.ts            # batch queue (FIFO, per-item status)
    review.ts           # review queue + accuracy accounting
    lanes.ts            # 3-lane assignment + per-lane stats
    export.ts           # gate-log CSV export (RFC 4180)
    preprocess.ts       # pure pixel pipeline (grayscale, contrast, Otsu, upscale)
```

## Honest limitations

- **Demo-grade OCR.** Tesseract.js is real OCR, but accuracy depends on image quality: sharp, well-lit, front-facing text. Rain, night, skewed angles, and dirty plates degrade it — production deployments pair this pipeline with fixed IR-illuminated gate cameras and a text-detection front end (e.g., YOLO-based region detection) before OCR.
- **Plates: transliteration, not Arabic script.** The parser covers the Latin-script forms (including 2-letter series, WW temporary plates, and Latin region-code suffixes). Real Moroccan plates carry the region code in Arabic script, which this English-model OCR cannot read — a production reader needs an Arabic-script model or a dedicated plate recognizer.
- **Lanes share one OCR engine.** Batch items serialize through a single in-browser Tesseract worker in queue order; the lane assignment and per-lane stats are real, but the lanes are not truly parallel here. Production lanes each run their own reader.
- **Review thumbnails are session-bound.** Pending review items whose image was an uploaded file lose their thumbnail after a page reload (browser object URLs don't persist); decided review history and accuracy stats survive. Sample-image reviews keep their thumbnails.
- **Mock registry.** Slots live in `localStorage`; production syncs with the terminal operating system (TOS).
- **Estimates, not guarantees.** The 9× figure is arithmetic on 180 s vs 20 s checks, not a measured deployment.

## Production roadmap

1. Text-detection front end (bounding boxes → per-region OCR) replacing full-frame passes
2. TOS integration for live slot data
3. Plate-model fine-tuning on Moroccan plates (Arabic script)
4. Edge deployment (Jetson / on-prem) for sub-second latency
5. ANPR camera presets per gate lane

## License

MIT — see [LICENSE](LICENSE).
