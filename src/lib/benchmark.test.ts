import { describe, it, expect } from 'vitest';
import {
  runBenchmark,
  aggregateCases,
  BENCHMARK_SAMPLES,
  type BenchmarkCaseResult,
} from './benchmark';
import { extractPlateCandidates } from './plates';
import { extractContainerCandidates } from './iso6346';

const extractFields = (text: string) => ({
  plate: extractPlateCandidates(text)[0] ?? '',
  container: extractContainerCandidates(text)[0] ?? '',
});

describe('benchmark', () => {
  it('has 4 labeled samples with ground truth', () => {
    expect(BENCHMARK_SAMPLES).toHaveLength(4);
    for (const s of BENCHMARK_SAMPLES) {
      expect(s.expectedContainer).toMatch(/^[A-Z]{4}[0-9]{7}$/);
    }
  });

  it('perfect recognizer scores CER 0 and field accuracy 1', async () => {
    const report = await runBenchmark({
      // Encode the sample id in the data URL so the stub can answer per-sample.
      prepareImage: async (sample) => `data:${sample.id}`,
      recognize: async (dataUrl) => {
        const sample = BENCHMARK_SAMPLES.find((s) => dataUrl === `data:${s.id}`)!;
        return { text: sample.expectedText, confidence: 99, ms: 10 };
      },
      extractFields,
      degradations: ['none'],
    });
    expect(report.perCase).toHaveLength(4);
    expect(report.overall.meanCer).toBe(0);
    expect(report.overall.meanWer).toBe(0);
    expect(report.overall.fieldAccuracy).toBe(1);
    expect(report.overall.containerAccuracy).toBe(1);
  });

  it('garbage recognizer scores CER > 0 and field accuracy 0', async () => {
    const report = await runBenchmark({
      prepareImage: async () => 'data:x',
      recognize: async () => ({ text: 'ZZZZZZZZZZZ', confidence: 10, ms: 5 }),
      extractFields,
      degradations: ['none'],
    });
    expect(report.overall.meanCer).toBeGreaterThan(0);
    expect(report.overall.fieldAccuracy).toBe(0);
  });

  it('aggregateCases handles plate-less samples and empty input', () => {
    const cases: BenchmarkCaseResult[] = [
      {
        sampleId: 's1', degradation: 'none', cer: 0, wer: 0,
        plateMatch: null, containerMatch: true, gotPlate: '', gotContainer: 'X',
        confidence: 90, ms: 1, confusionPairs: [],
      },
      {
        sampleId: 's2', degradation: 'none', cer: 0.5, wer: 1,
        plateMatch: false, containerMatch: false, gotPlate: 'Y', gotContainer: 'Z',
        confidence: 40, ms: 2, confusionPairs: [],
      },
    ];
    const agg = aggregateCases(cases);
    expect(agg.meanCer).toBe(0.25);
    expect(agg.plateAccuracy).toBe(0);
    expect(agg.containerAccuracy).toBe(0.5);
    // 3 fields present (1 container + plate+container), 1 correct.
    expect(agg.fieldAccuracy).toBeCloseTo(1 / 3, 10);
    expect(aggregateCases([]).cases).toBe(0);
  });
});
