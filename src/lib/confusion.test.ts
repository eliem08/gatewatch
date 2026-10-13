import { describe, it, expect } from 'vitest';
import {
  correctionToRecords,
  aggregateConfusion,
} from './confusion';

describe('confusion', () => {
  it('creates one record per changed field, none when unchanged', () => {
    const one = correctionToRecords({
      ocrPlate: '78452-A-17',
      correctedPlate: '78452-A-17',
      ocrContainer: 'MSKU7392O17',
      correctedContainer: 'MSKU7392017',
      preprocessing: 'on',
      quality: 'clean',
    });
    expect(one).toHaveLength(1);
    expect(one[0].field).toBe('container');

    const none = correctionToRecords({
      ocrPlate: '78452-A-17',
      correctedPlate: '78452-A-17',
      ocrContainer: 'MSKU7392017',
      correctedContainer: 'MSKU7392017',
      preprocessing: 'on',
      quality: 'clean',
    });
    expect(none).toHaveLength(0);
  });

  it('aggregates top pairs and splits by preprocessing', () => {
    const records = [
      ...correctionToRecords({
        ocrPlate: '', correctedPlate: '',
        ocrContainer: 'MSKU7392O17', correctedContainer: 'MSKU7392017',
        preprocessing: 'on', quality: 'clean',
      }),
      ...correctionToRecords({
        ocrPlate: '', correctedPlate: '',
        ocrContainer: 'MSKU7392O17', correctedContainer: 'MSKU7392017',
        preprocessing: 'off', quality: 'noisy',
      }),
      ...correctionToRecords({
        ocrPlate: '78452-A-17', correctedPlate: '78452-A-17',
        ocrContainer: 'MSKU7392O17', correctedContainer: 'MSKU7392017',
        preprocessing: 'on', quality: 'clean',
      }),
    ];
    const agg = aggregateConfusion(records);
    expect(agg.totalCorrections).toBe(3);
    // Each correction is a single 0→O substitution (OCR 'O' vs true '0').
    expect(agg.topPairs[0]).toEqual({ from: '0', to: 'O', count: 3 });
    expect(agg.byPreprocessing.on).toEqual([{ from: '0', to: 'O', count: 2 }]);
    expect(agg.byPreprocessing.off).toEqual([{ from: '0', to: 'O', count: 1 }]);
    expect(agg.byField).toEqual({ plate: 0, container: 3 });
    expect(agg.byQuality).toEqual([
      { quality: 'clean', count: 2 },
      { quality: 'noisy', count: 1 },
    ]);
  });
});
