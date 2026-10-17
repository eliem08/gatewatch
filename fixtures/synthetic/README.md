# Synthetic fixtures — READ THIS FIRST

Everything in this directory is **fabricated**. The image URIs point at
nothing, the annotations were typed by hand, the OCR results were
invented. They exist for one purpose: **engineering tests of the
software pipeline** (does the schema parse, does the verifier route,
does the export serialize).

## The gap, stated plainly

These fixtures prove **pipeline correctness only**. They say **nothing**
about real-world OCR accuracy — no claim about read rates, character
error rates, or field accuracy on real gate captures can be grounded in
them. The benchmark page's 4 SVG renders are in the same category.

Real accuracy numbers require the dataset defined in
`src/lib/datasets.ts`: hundreds of labeled real terminal captures
across lighting/weather/angle strata, collected with the terminal
operator. **That dataset does not exist.** See `docs/ACCEPTANCE.md`
for the bar a supervised pilot would need to clear.

## Files

- `gate-validation-sample.json` — a `provenance: "synthetic"` manifest
  conforming to `GateValidationDatasetSchema` (3 fabricated images).
- `ocr-results-sample.json` — fabricated OCR results conforming to
  `GateScanSubmissionSchema` (one clean read, one low-confidence read,
  one split-confidence read with no appointment).

Both are validated against their schemas in `src/lib/datasets.test.ts`.
If you add a fixture, keep `provenance: "synthetic"` and the
`synthetic` naming — tooling and reviewers must never mistake these
for real data.
