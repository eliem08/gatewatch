/**
 * Formal evaluation harness.
 *
 * Labeled test set = the 4 SVG sample images with known ground-truth
 * plate/container values (taken from the UploadZone sample labels).
 * Each sample is run under each degradation (clean + 5 degradations),
 * OCR'd, and scored: CER / WER on the expected text, per-field exact
 * match for plate and container, and the confusion pairs from the
 * errors. Aggregates are reported per degradation and overall.
 *
 * The runner is engine-agnostic: the caller supplies `prepareImage`
 * (sample + degradation → data URL) and `recognize` (data URL →
 * {text, confidence}), so tests can stub both and the page can wire the
 * real canvas + Tesseract pipeline.
 */
import { applyDegradation, type DegradationKind, DEGRADATIONS } from './degrade';
import { cer, wer, alignSubstitutions, type ConfusionPair } from './metrics';

export type BenchmarkSample = {
  id: string;
  imageUrl: string;
  label: string;
  /** Expected OCR text: container + plate, space-separated. */
  expectedText: string;
  expectedPlate: string;
  expectedContainer: string;
};

export const BENCHMARK_SAMPLES: BenchmarkSample[] = [
  {
    id: 'sample-1',
    imageUrl: '/samples/sample-1-tclu.svg',
    label: 'Container TCLU 482913-2',
    expectedText: 'TCLU4829132',
    expectedPlate: '',
    expectedContainer: 'TCLU4829132',
  },
  {
    id: 'sample-2',
    imageUrl: '/samples/sample-2-msku.svg',
    label: 'Truck MSKU 739201-7 · plate 78452-A-17',
    expectedText: 'MSKU7392017 78452-A-17',
    expectedPlate: '78452-A-17',
    expectedContainer: 'MSKU7392017',
  },
  {
    id: 'sample-3',
    imageUrl: '/samples/sample-3-gesu.svg',
    label: 'Container GESU 556720-2',
    expectedText: 'GESU5567202',
    expectedPlate: '',
    expectedContainer: 'GESU5567202',
  },
  {
    id: 'sample-4',
    imageUrl: '/samples/sample-4-fciu.svg',
    label: 'Truck FCIU 908134-3 · plate 91208-B-45',
    expectedText: 'FCIU9081343 91208-B-45',
    expectedPlate: '91208-B-45',
    expectedContainer: 'FCIU9081343',
  },
];

export type BenchmarkCaseResult = {
  sampleId: string;
  degradation: DegradationKind;
  cer: number;
  wer: number;
  plateMatch: boolean | null; // null when the sample has no plate
  containerMatch: boolean;
  gotPlate: string;
  gotContainer: string;
  confidence: number;
  ms: number;
  confusionPairs: ConfusionPair[];
  error?: string;
};

export type BenchmarkAggregate = {
  meanCer: number;
  meanWer: number;
  plateAccuracy: number | null;
  containerAccuracy: number;
  fieldAccuracy: number;
  cases: number;
};

export type BenchmarkReport = {
  perCase: BenchmarkCaseResult[];
  overall: BenchmarkAggregate;
  byDegradation: Record<DegradationKind, BenchmarkAggregate>;
  topConfusions: Array<{ from: string; to: string; count: number }>;
};

/**
 * Aggregates case results into one summary. Plate accuracy is null when
 * no case had a plate to find.
 */
export function aggregateCases(cases: BenchmarkCaseResult[]): BenchmarkAggregate {
  if (cases.length === 0) {
    return { meanCer: 0, meanWer: 0, plateAccuracy: null, containerAccuracy: 0, fieldAccuracy: 0, cases: 0 };
  }
  const meanCer = cases.reduce((a, c) => a + c.cer, 0) / cases.length;
  const meanWer = cases.reduce((a, c) => a + c.wer, 0) / cases.length;
  const plateCases = cases.filter((c) => c.plateMatch !== null);
  const plateAccuracy =
    plateCases.length > 0
      ? plateCases.filter((c) => c.plateMatch).length / plateCases.length
      : null;
  const containerAccuracy = cases.filter((c) => c.containerMatch).length / cases.length;
  // Field accuracy: fraction of present fields recovered exactly.
  let fields = 0;
  let fieldsOk = 0;
  for (const c of cases) {
    if (c.plateMatch !== null) {
      fields++;
      if (c.plateMatch) fieldsOk++;
    }
    fields++;
    if (c.containerMatch) fieldsOk++;
  }
  return {
    meanCer,
    meanWer,
    plateAccuracy,
    containerAccuracy,
    fieldAccuracy: fields > 0 ? fieldsOk / fields : 0,
    cases: cases.length,
  };
}

/**
 * Runs the full benchmark: every sample × every degradation.
 *
 * @param prepareImage renders (sample, degradation) to a data URL the
 *   recognizer can consume. Degradation pixels are applied by the caller
 *   (canvas) using `applyDegradation`.
 * @param recognize OCR function (data URL → text + confidence).
 * @param extractFields parses raw OCR text into [plate, container].
 * @param degradations subset to run (default: all).
 */
export async function runBenchmark(args: {
  prepareImage: (sample: BenchmarkSample, degradation: DegradationKind) => Promise<string>;
  recognize: (dataUrl: string) => Promise<{ text: string; confidence: number; ms: number }>;
  extractFields: (text: string) => { plate: string; container: string };
  degradations?: DegradationKind[];
  onProgress?: (done: number, total: number, label: string) => void;
}): Promise<BenchmarkReport> {
  const degradations = args.degradations ?? DEGRADATIONS.map((d) => d.kind);
  const total = BENCHMARK_SAMPLES.length * degradations.length;
  let done = 0;
  const perCase: BenchmarkCaseResult[] = [];
  const confusionCounts = new Map<string, number>();

  for (const sample of BENCHMARK_SAMPLES) {
    for (const degradation of degradations) {
      args.onProgress?.(done, total, `${sample.id} · ${degradation}`);
      try {
        const dataUrl = await args.prepareImage(sample, degradation);
        const res = await args.recognize(dataUrl);
        const fields = args.extractFields(res.text);
        const plateMatch =
          sample.expectedPlate === '' ? null : fields.plate === sample.expectedPlate;
        const containerMatch = fields.container === sample.expectedContainer;
        const confusionPairs = alignSubstitutions(
          sample.expectedText.replace(/\s+/g, ' '),
          res.text.replace(/\s+/g, ' ').trim(),
        );
        for (const p of confusionPairs) {
          const key = `${p.from}→${p.to}`;
          confusionCounts.set(key, (confusionCounts.get(key) ?? 0) + 1);
        }
        perCase.push({
          sampleId: sample.id,
          degradation,
          cer: cer(sample.expectedText, res.text.replace(/\s+/g, ' ').trim()),
          wer: wer(sample.expectedText, res.text.replace(/\s+/g, ' ').trim()),
          plateMatch,
          containerMatch,
          gotPlate: fields.plate,
          gotContainer: fields.container,
          confidence: res.confidence,
          ms: res.ms,
          confusionPairs,
        });
      } catch (err) {
        perCase.push({
          sampleId: sample.id,
          degradation,
          cer: 1,
          wer: 1,
          plateMatch: sample.expectedPlate === '' ? null : false,
          containerMatch: false,
          gotPlate: '',
          gotContainer: '',
          confidence: 0,
          ms: 0,
          confusionPairs: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
      done++;
    }
  }

  const byDegradation = {} as Record<DegradationKind, BenchmarkAggregate>;
  for (const d of degradations) {
    byDegradation[d] = aggregateCases(perCase.filter((c) => c.degradation === d));
  }
  const topConfusions = [...confusionCounts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('→');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

  return { perCase, overall: aggregateCases(perCase), byDegradation, topConfusions };
}

// Re-exported for callers that render degraded pixels themselves.
export { applyDegradation };
