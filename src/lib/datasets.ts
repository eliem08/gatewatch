/**
 * Versioned zod schemas for REAL-WORLD validation datasets.
 *
 * ------------------------------------------------------------------ *
 * PLAIN STATEMENT: NO REAL DATASET EXISTS.
 *
 * GateWatch has never been run against labeled real gate captures. The
 * benchmark page scores 4 synthetic SVG renders; the confusion log
 * aggregates operator corrections from demo use. Nothing here measures
 * real-world OCR accuracy, and these schemas do not change that.
 *
 * What this file IS: the contract a data-collection effort with the
 * terminal operator would need to produce before anyone can claim a
 * real-world accuracy number. Image bytes are referenced by URI + hash,
 * never embedded — collection, storage, and access stay with the
 * operator; this repo only defines the annotation shape.
 * ------------------------------------------------------------------ *
 *
 * Provenance discipline: every manifest declares
 * `provenance: 'real-terminal-capture' | 'synthetic'`. Synthetic
 * manifests (see fixtures/synthetic/) exist ONLY for engineering tests
 * of the pipeline — they prove software correctness, never OCR accuracy.
 * Any accuracy claim computed over a synthetic manifest is a category
 * error; the schemas make the provenance machine-readable so tooling
 * can refuse to mix them.
 */

import { z } from 'zod';
import { UtcDatetimeSchema } from './contracts';

/** Current version of the validation-dataset contract. */
export const DATASET_CONTRACT_VERSION = '1.0.0' as const;

/** Bounding box in normalized 0–1 coordinates (x, y = top-left). */
export const BoundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict()
  .refine((b) => b.x + b.width <= 1 && b.y + b.height <= 1, {
    message: 'bounding box must stay inside the normalized frame',
  });

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/** Capture conditions — the covariates real-world accuracy depends on. */
export const CaptureConditionsSchema = z
  .object({
    capturedAtUtc: UtcDatetimeSchema,
    lighting: z.enum([
      'daylight',
      'dusk',
      'night',
      'ir-illuminated',
      'unknown',
    ]),
    weather: z.enum(['clear', 'rain', 'fog', 'dust', 'unknown']),
    cameraId: z.string().min(1).max(64),
    cameraAngle: z.enum(['front', 'rear', 'side', 'overhead', 'unknown']),
    resolutionWidth: z.number().int().positive(),
    resolutionHeight: z.number().int().positive(),
  })
  .strict();

export type CaptureConditions = z.infer<typeof CaptureConditionsSchema>;

/**
 * Human ground truth for one image. Deliberately NOT check-digit-gated:
 * real paint can carry a wrong check digit, and the annotation records
 * what is ON the container, not what validates. Identity is established
 * by matching the appointment record, never by the annotation alone.
 */
export const GateImageAnnotationSchema = z
  .object({
    containerNumber: z.string().min(1).max(32),
    plate: z.string().min(1).max(32),
    containerBox: BoundingBoxSchema.optional(),
    plateBox: BoundingBoxSchema.optional(),
    annotatorId: z.string().min(1).max(64),
    annotatedAtUtc: UtcDatetimeSchema,
    reviewStatus: z.enum(['single', 'double-verified', 'adjudicated']),
    notes: z.string().max(500).optional(),
  })
  .strict();

export type GateImageAnnotation = z.infer<typeof GateImageAnnotationSchema>;

/** One labeled image: pointer to the bytes + conditions + ground truth. */
export const LabeledGateImageSchema = z
  .object({
    imageId: z.string().min(1).max(128),
    /** Pointer only — bytes live with the operator, never in this repo. */
    imageUri: z.string().min(1).max(512),
    /** Integrity of the bytes the annotation was made against. */
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'expected lowercase hex sha256')
      .optional(),
    capture: CaptureConditionsSchema,
    annotation: GateImageAnnotationSchema,
  })
  .strict();

export type LabeledGateImage = z.infer<typeof LabeledGateImageSchema>;

/**
 * A versioned validation-dataset manifest. Real collection needs scale:
 * the acceptance criteria (docs/ACCEPTANCE.md) require hundreds of
 * labeled frames across lighting/weather/angle strata before any
 * accuracy number is publishable — a bar this schema lets tooling
 * enforce, not one this repo meets.
 */
export const GateValidationDatasetSchema = z
  .object({
    datasetContractVersion: z.literal(DATASET_CONTRACT_VERSION),
    datasetId: z.string().min(1).max(128),
    provenance: z.enum(['real-terminal-capture', 'synthetic']),
    createdAtUtc: UtcDatetimeSchema,
    description: z.string().min(1).max(2000),
    /** Who collected it, e.g. the terminal operator — never "gatewatch". */
    collector: z.string().min(1).max(128),
    license: z.string().min(1).max(128),
    images: z.array(LabeledGateImageSchema).min(1),
  })
  .strict()
  .superRefine((dataset, ctx) => {
    const seen = new Set<string>();
    for (const image of dataset.images) {
      if (seen.has(image.imageId)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate imageId "${image.imageId}"`,
        });
      }
      seen.add(image.imageId);
    }
    if (
      dataset.provenance === 'real-terminal-capture' &&
      dataset.collector.toLowerCase().includes('synthetic')
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'provenance "real-terminal-capture" with a synthetic-sounding collector — fix the provenance label',
      });
    }
  });

export type GateValidationDataset = z.infer<typeof GateValidationDatasetSchema>;

/**
 * Validates a dataset manifest object against the contract.
 * @param raw unknown manifest (e.g. parsed JSON from the operator).
 * @returns the typed manifest, or null when invalid (caller logs issues).
 */
export function validateDatasetManifest(
  raw: unknown,
): { ok: true; dataset: GateValidationDataset } | { ok: false; issues: string[] } {
  const parsed = GateValidationDatasetSchema.safeParse(raw);
  if (parsed.success) return { ok: true, dataset: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`,
    ),
  };
}
