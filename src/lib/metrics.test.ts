import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  levenshteinTokens,
  cer,
  wer,
  fieldAccuracy,
  alignSubstitutions,
  confusionTable,
} from './metrics';

describe('metrics', () => {
  it('levenshtein matches known values', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('CER is 0 for identical strings and 1/11 for one substitution', () => {
    expect(cer('MSKU7392017', 'MSKU7392017')).toBe(0);
    // 0 → O in an 11-char container number.
    expect(cer('MSKU7392017', 'MSKU7392O17')).toBeCloseTo(1 / 11, 10);
  });

  it('WER counts word-level edits', () => {
    expect(wer('A B C', 'A B C')).toBe(0);
    expect(wer('A B C', 'A X C')).toBeCloseTo(1 / 3, 10);
    expect(levenshteinTokens(['A', 'B'], ['A', 'B', 'C'])).toBe(1);
  });

  it('field accuracy counts exact matches only', () => {
    expect(fieldAccuracy(['A', 'B'], ['A', 'B'])).toBe(1);
    expect(fieldAccuracy(['A', 'B'], ['A', 'X'])).toBe(0.5);
    expect(fieldAccuracy(['A', 'B'], ['', ''])).toBe(0);
  });

  it('alignSubstitutions extracts 0→O and skips separators', () => {
    expect(alignSubstitutions('0', 'O')).toEqual([{ from: '0', to: 'O' }]);
    // Deleting a dash is not a confusion.
    expect(alignSubstitutions('MSKU-7392017', 'MSKU7392017')).toEqual([]);
    expect(alignSubstitutions('ABC', 'ABC')).toEqual([]);
  });

  it('confusionTable ranks by count', () => {
    const table = confusionTable([
      { reference: '0', hypothesis: 'O' },
      { reference: '0', hypothesis: 'O' },
      { reference: '1', hypothesis: 'I' },
    ]);
    expect(table[0]).toEqual({ from: '0', to: 'O', count: 2 });
    expect(table[1]).toEqual({ from: '1', to: 'I', count: 1 });
  });
});
