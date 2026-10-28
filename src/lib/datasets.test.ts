/**
 * Phase D -- dataset contract tests.
 *
 * Tests the SCHEMA, not data: there is no real dataset, so these tests
 * assert the contract rejects malformed manifests and that the only
 * fixtures in this repo are explicitly SYNTHETIC ones (which validate).
 * An accuracy claim grounded in fixtures/synthetic/ is a category error;
 * the provenance field exists so tooling can refuse to mix them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GateValidationDatasetSchema,
  validateDatasetManifest,
  DATASET_CONTRACT_VERSION,
} from './datasets';
import { GateScanSubmissionSchema } from './contracts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', 'fixtures', 'synthetic');

/** Loads a fixture, stripping `_`-prefixed comment keys (human labels
 *  like `_label` are not contract fields — the schemas stay strict). */
function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => [k, stripComments(v)]),
    );
  }
  return value;
}

function loadJson(name: string): unknown {
  return stripComments(
    JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8')),
  );
}

/** One minimal valid image record; tests mutate copies of it. */
function validImage(imageId: string): Record<string, any> {
  return {
    imageId,
    imageUri: 'synthetic://fixtures/x.jpg',
    capture: {
      capturedAtUtc: '2026-10-18T08:15:00Z',
      lighting: 'daylight',
      weather: 'clear',
      cameraId: 'cam-A',
      cameraAngle: 'rear',
      resolutionWidth: 1920,
      resolutionHeight: 1080,
    },
    annotation: {
      containerNumber: 'MSKU0000006',
      plate: '48213-A-6',
      annotatorId: 'synthetic',
      annotatedAtUtc: '2026-10-18T00:00:00Z',
      reviewStatus: 'double-verified',
    },
  };
}

function validManifest(images: unknown[]): Record<string, any> {
  return {
    datasetContractVersion: DATASET_CONTRACT_VERSION,
    datasetId: 'test-manifest',
    provenance: 'synthetic',
    createdAtUtc: '2026-10-18T00:00:00Z',
    description: 'test',
    collector: 'gatewatch-synthetic-generator',
    license: 'synthetic-fixture-no-real-data',
    images,
  };
}

describe('dataset contract', () => {
  it('pins the contract version', () => {
    expect(DATASET_CONTRACT_VERSION).toBe('1.0.0');
  });

  it('accepts a well-formed synthetic manifest', () => {
    const res = validateDatasetManifest(validManifest([validImage('img-1')]));
    expect(res.ok).toBe(true);
  });

  it('rejects a bounding box outside the normalized frame', () => {
    const image = validImage('img-1');
    image.annotation.containerBox = {
      x: 0.8,
      y: 0.1,
      width: 0.5, // x + width = 1.3 > 1
      height: 0.2,
    };
    const res = validateDatasetManifest(validManifest([image]));
    expect(res.ok).toBe(false);
  });

  it('rejects duplicate imageIds', () => {
    const res = validateDatasetManifest(
      validManifest([validImage('dup'), validImage('dup')]),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.includes('duplicate imageId'))).toBe(true);
    }
  });

  it('rejects a wrong contract version literal', () => {
    const manifest = validManifest([validImage('img-1')]);
    manifest.datasetContractVersion = '2.0.0';
    expect(validateDatasetManifest(manifest).ok).toBe(false);
  });

  it('rejects an empty image list and unknown provenance', () => {
    expect(validateDatasetManifest(validManifest([])).ok).toBe(false);
    const manifest = validManifest([validImage('img-1')]);
    manifest.provenance = 'real-photos';
    expect(validateDatasetManifest(manifest).ok).toBe(false);
  });

  it('rejects missing ground truth and bad timestamps', () => {
    const image = validImage('img-1');
    delete image.annotation.plate;
    expect(validateDatasetManifest(validManifest([image])).ok).toBe(false);

    const image2 = validImage('img-2');
    image2.capture.capturedAtUtc = 'yesterday';
    expect(validateDatasetManifest(validManifest([image2])).ok).toBe(false);
  });

  it('flags real-terminal-capture provenance with a synthetic-sounding collector', () => {
    const manifest = validManifest([validImage('img-1')]);
    manifest.provenance = 'real-terminal-capture';
    manifest.collector = 'synthetic-test-data';
    const res = validateDatasetManifest(manifest);
    expect(res.ok).toBe(false);
  });

  it('does not require a valid ISO 6346 check digit in ground truth', () => {
    // Real paint can carry a wrong check digit; the annotation records
    // what is ON the container. (MSKU0000007 fails the check digit.)
    const image = validImage('img-1');
    image.annotation.containerNumber = 'MSKU0000007';
    expect(validateDatasetManifest(validManifest([image])).ok).toBe(true);
  });

  it('unused schema export keeps the import honest', () => {
    // GateValidationDatasetSchema is the source validateDatasetManifest uses.
    expect(GateValidationDatasetSchema).toBeDefined();
  });
});

describe('synthetic fixtures on disk', () => {
  it('the dataset fixture validates and is labeled synthetic', () => {
    const raw = loadJson('gate-validation-sample.json');
    const res = validateDatasetManifest(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dataset.provenance).toBe('synthetic');
    expect(res.dataset.images.length).toBe(3);
  });

  it('the OCR-results fixture validates against the submission schema', () => {
    const raw = loadJson('ocr-results-sample.json') as {
      results: unknown[];
    };
    expect(raw.results.length).toBe(3);
    for (const result of raw.results) {
      expect(GateScanSubmissionSchema.safeParse(result).success).toBe(true);
    }
  });

  it('no fixture in this repo claims real-terminal-capture provenance', () => {
    const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = loadJson(file) as { provenance?: string };
      if (Object.prototype.hasOwnProperty.call(raw, 'provenance')) {
        expect(raw.provenance).toBe('synthetic');
      }
      const text = JSON.stringify(raw).toLowerCase();
      expect(text).not.toContain('real-terminal-capture');
    }
  });
});
