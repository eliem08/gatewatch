'use client';

import { CITATIONS } from '@/lib/citations';
import { OWNER_REGISTRY, type OwnerKind } from '@/lib/owners';
import { CONTAINER_LETTER_VALUES } from '@/lib/iso6346';
import { Eyebrow, Card, SectionTitle } from '@/components/ui';

const PIPELINE_STEPS = [
  {
    name: '1 · Capture',
    body: 'Gate camera frame (or uploaded photo / sample SVG). No assumption about framing — the plate may sit anywhere in the frame.',
    when: 'Fixed camera, plate in lower third of frame.',
  },
  {
    name: '2 · Grayscale',
    body: 'Luminance conversion (0.299R + 0.587G + 0.114B). Colour carries no signal for printed characters; dropping it cuts noise and compute.',
    when: 'Always on.',
  },
  {
    name: '3 · Denoise',
    body: '3×3 median filter. Removes salt-and-pepper sensor noise while preserving stroke edges — unlike a blur, it does not smear character boundaries.',
    when: 'Noisy / low-light captures. Skip on clean images (it costs time for no gain).',
  },
  {
    name: '4 · Equalize',
    body: 'Histogram equalization (global) or CLAHE (tile-based, clip-limited, bilinearly interpolated). Spreads washed-out intensities so faint paint reads.',
    when: 'Washed-out or unevenly lit captures. CLAHE over global HE when the background is noisy — global HE amplifies noise in flat regions.',
  },
  {
    name: '5 · Deskew',
    body: 'Hough-style accumulator: dark pixels vote for line offsets ρ = x·cos θ + y·sin θ over normal angles θ ∈ [78°, 102°]; the peak gives the text-line angle, and the image is rotated back by −angle.',
    when: 'Tilted camera or skewed plate. Auto-skips when |angle| < 0.5°.',
  },
  {
    name: '6 · Contrast stretch',
    body: 'Percentile stretch (2nd–98th percentile → 0–255). Cheap, safe, and usually the single most effective step on faded paint.',
    when: 'Faded / low-contrast captures. Harmless on clean ones.',
  },
  {
    name: '7 · Threshold',
    body: 'Otsu (global, maximises between-class variance) or adaptive local-mean threshold (handles uneven illumination that defeats any single global cut).',
    when: 'Otsu for even light; adaptive for shadows / partial shade across the plate.',
  },
  {
    name: '8 · Upscale',
    body: '2× nearest-neighbour upscale. Tesseract’s LSTM expects characters at a comfortable pixel height; upscaling small plate crops measurably helps.',
    when: 'Small / distant plates. Skip on already-large frames.',
  },
  {
    name: '9 · Ensemble OCR',
    body: 'Tesseract run four times with PSM 6, 7, 11, 13. Each pass is parsed into plate/container candidates; the winner is picked by confidence-weighted vote. Different layout modes make different mistakes, so the vote cancels uncorrelated errors.',
    when: 'Always. The cost is ~4× OCR time; the benefit is fewer layout-driven misses.',
  },
  {
    name: '10 · Verify',
    body: 'Plate shape check, ISO 6346 check-digit validation, owner-code lookup, slot match. A failed check digit is a misread signal, not a rejection — the read goes to human review.',
    when: 'Always.',
  },
];

const FAILURE_MODES = [
  {
    name: 'Glare / specular reflection',
    body: 'Windshield or plate glare blows out strokes to white. Adaptive threshold sometimes recovers the edges; often the only fix is a polarising filter on the camera or a different capture angle.',
  },
  {
    name: 'Occlusion',
    body: 'Wiper blades, dirt, mud, or a second vehicle covering part of the plate. The benchmark’s occlusion condition measures exactly this. No preprocessing recovers characters that are not in the pixels.',
  },
  {
    name: 'Motion blur',
    body: 'Truck moving through the gate smears strokes horizontally. Shorter exposure / triggered capture (induction loop) fixes it at the source; deblurring in software is unreliable.',
  },
  {
    name: 'Non-standard fonts / plates',
    body: 'Hand-painted plates, dealer plates, and foreign plates break the shape assumptions. The plate parser accepts the documented Moroccan formats only; anything else goes to review.',
  },
  {
    name: 'Arabic-script region codes',
    body: 'Real Moroccan plates carry the region code in Arabic script. The English Tesseract model cannot read it, so the demo accepts Latin transliterations (CAS, RAB, …) from transit paperwork. A production system needs an Arabic-script model (ara.traineddata) as a second engine.',
  },
  {
    name: 'Confusable characters',
    body: '0/O, 1/I, 5/S, 8/B are the classic OCR confusions. The check digit catches container-number confusions; plates have no check digit, so plate confusions rely on the review queue and the confusion log.',
  },
];

const PRODUCTION_NEEDS = [
  'Fixed ANPR-grade camera per lane: global shutter, ≥1080p, IR illumination, polarising filter, triggered capture (induction loop or radar) so the plate is sharp and centred.',
  'A dedicated plate camera (tight crop) plus a context camera (full truck) — the two-pass trick in this demo is a software approximation of that hardware.',
  'Arabic-script OCR engine (ara.traineddata) for region codes, and a second engine for Latin text, combined by the same voting logic.',
  'A trained ANPR model (e.g. a detector + recognizer fine-tuned on Moroccan plates) to replace generic Tesseract when accuracy, not flexibility, is the requirement.',
  'TOS integration: slot registry synced from the terminal operating system instead of browser localStorage; server-side logging and audit trail.',
  'Measured accuracy on real gate captures — the benchmark here runs on 4 synthetic samples; a production sign-off needs hundreds of labeled real frames.',
];

const LIMITS = [
  'Browser Tesseract (LSTM, generic English model) is not an ANPR model. Commercial ANPR systems use plate detectors + recognizers trained on millions of plate crops and reach far higher accuracy on real gate footage.',
  'The labeled test set is 4 synthetic SVG samples, not real photos. Benchmark numbers measure robustness to synthetic degradation, not real-world accuracy.',
  'The ensemble votes on parsed fields, not on aligned strings — it cannot correct a character that every engine misreads the same way (e.g. a badly occluded 0).',
  'Preprocessing is CPU-only canvas work in the browser. On large frames the Hough deskew and CLAHE steps are the slowest; they are optional for that reason.',
  'The BIC registry is partial (major carriers + lessors). An unknown owner code is not an error.',
];

const LETTER_VALUES = Object.entries(CONTAINER_LETTER_VALUES);

function ownerRows(kind: OwnerKind) {
  return Object.entries(OWNER_REGISTRY)
    .filter(([, e]) => e.kind === kind)
    .sort(([a], [b]) => a.localeCompare(b));
}

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5] px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <Eyebrow>METHODOLOGY — HOW IT WORKS, AND WHERE IT BREAKS</Eyebrow>
          <h1 className="font-display text-4xl">Methodology.</h1>
          <p className="text-[#8B98AD] max-w-2xl">
            Every step of the pipeline, the math behind the check digit, the measured failure modes, and
            what a production deployment would still need. Nothing here is marketing copy.
          </p>
        </header>

        <section className="space-y-4">
          <SectionTitle>Pipeline</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {PIPELINE_STEPS.map((s) => (
              <Card key={s.name}>
                <div className="font-mono text-sm font-semibold text-[#FFB300]">{s.name}</div>
                <p className="mt-2 text-sm leading-relaxed text-[#E8EDF5]">{s.body}</p>
                <p className="mt-2 font-mono text-[11px] text-[#8B98AD]">Use when: {s.when}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4" id="iso">
          <SectionTitle>ISO 6346 — the check digit, fully worked</SectionTitle>
          <Card>
            <p className="text-sm leading-relaxed text-[#E8EDF5]">
              A container number is 4 owner letters + 6 serial digits + 1 check digit. Each letter maps to a
              number (multiples of 11 are skipped, so the mapping is not A=1…Z=26). Each of the first 10
              characters is multiplied by a power of two (2⁰ … 2⁹), the products are summed, and the check
              digit is the sum mod 11 — with 10 mapped to 0, since a check digit must be a single digit.
            </p>
            <div className="mt-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">Letter values</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LETTER_VALUES.map(([letter, value]) => (
                  <span key={letter} className="rounded border border-[#1F2A3D] bg-[#0B0F16] px-2 py-1 font-mono text-xs">
                    {letter} = {value}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
                Worked example — CSQU 305438 3
              </div>
              <pre className="mt-2 overflow-x-auto rounded border border-[#1F2A3D] bg-[#0B0F16] p-3 font-mono text-xs leading-relaxed text-[#8B98AD]">
{`C=13  S=30  Q=28  U=32  3  0  5  4  3  8
×1   ×2   ×4   ×8  ×16 ×32 ×64 ×128 ×256 ×512
= 13 + 60 + 112 + 256 + 48 + 0 + 320 + 512 + 768 + 4096
= 6185
6185 mod 11 = 3  →  check digit 3 ✓`}
              </pre>
            </div>
            <p className="mt-3 font-mono text-[11px] text-[#8B98AD]">
              Why it matters for OCR: the check digit catches single-character misreads (e.g. 0 read as O)
              with high probability. A failed check digit is treated as a misread signal and routed to human
              review — it is never silently accepted.
            </p>
          </Card>
        </section>

        <section className="space-y-4" id="owners">
          <SectionTitle>BIC owner-code registry (partial)</SectionTitle>
          <p className="font-mono text-xs text-[#8B98AD]">
            The 4th letter is the equipment category: U = freight container, J = detachable equipment,
            Z = trailer/chassis. This registry covers major carriers and lessors; the full BIC register
            holds thousands of codes. Unknown code = not in this demo registry, not an error.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-mono text-xs uppercase tracking-wider text-[#8B98AD] border-b border-[#1F2A3D]">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Carrier</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerRows('carrier').map(([code, e]) => (
                    <tr key={code} className="border-b border-[#1F2A3D]/60 last:border-0">
                      <td className="px-4 py-3 font-mono text-[#FFB300]">{code}</td>
                      <td className="px-4 py-3">{e.line}{e.note ? <span className="block font-mono text-[11px] text-[#8B98AD]">{e.note}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-mono text-xs uppercase tracking-wider text-[#8B98AD] border-b border-[#1F2A3D]">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Lessor</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerRows('lessor').map(([code, e]) => (
                    <tr key={code} className="border-b border-[#1F2A3D]/60 last:border-0">
                      <td className="px-4 py-3 font-mono text-[#FFB300]">{code}</td>
                      <td className="px-4 py-3">{e.line}{e.note ? <span className="block font-mono text-[11px] text-[#8B98AD]">{e.note}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <p className="font-mono text-xs text-[#8B98AD]">
            A large share of the world fleet is leased, so the code on the box often names the lessor, not
            the operating carrier — paint colour and owner code can disagree, and the code wins.
          </p>
        </section>

        <section className="space-y-4">
          <SectionTitle>Failure modes</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {FAILURE_MODES.map((f) => (
              <Card key={f.name}>
                <div className="font-mono text-sm font-semibold text-[#EF4444]">{f.name}</div>
                <p className="mt-2 text-sm leading-relaxed text-[#E8EDF5]">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>What production needs</SectionTitle>
          <Card>
            <ul className="space-y-2 text-sm leading-relaxed text-[#E8EDF5]">
              {PRODUCTION_NEEDS.map((n) => (
                <li key={n} className="flex gap-2">
                  <span className="text-[#FFB300]">→</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="space-y-4">
          <SectionTitle>Honest limits</SectionTitle>
          <Card>
            <ul className="space-y-2 text-sm leading-relaxed text-[#E8EDF5]">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-2">
                  <span className="text-[#EF4444]">×</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="space-y-4">
          <SectionTitle>References</SectionTitle>
          <Card>
            <ul className="space-y-3">
              {CITATIONS.map((c) => (
                <li key={c.title} className="text-sm leading-relaxed">
                  <span className="text-[#E8EDF5]">
                    {c.authors} ({c.year}). <em>{c.title}.</em> {c.venue}.
                  </span>{' '}
                  <span className="text-[#8B98AD]">{c.relevance}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-[11px] text-[#8B98AD]">
              Every citation above was verified to exist before being listed. The benchmark numbers on the{' '}
              <a href="/benchmark" className="text-[#3B82F6] underline-offset-4 hover:underline">
                benchmark page
              </a>{' '}
              are reproducible from the labeled samples in this repo.
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}
