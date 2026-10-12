import { describe, it, expect } from 'vitest';
import { normalizePlate, isPlausiblePlate, extractPlateCandidates } from './plates';

describe('plates', () => {
  it('normalizes plate', () => {
    expect(normalizePlate(' 78452 - a - 17 ')).toBe('78452-A-17');
  });

  it('checks plausible plates', () => {
    expect(isPlausiblePlate('78452-A-17')).toBe(true);
    expect(isPlausiblePlate('ABC')).toBe(false);
    expect(isPlausiblePlate(normalizePlate('78452–A–17'))).toBe(true);
  });

  it('extracts plate candidates', () => {
    expect(extractPlateCandidates('plate 78452-A-17 seen')).toEqual(['78452-A-17']);
    expect(extractPlateCandidates('nothing')).toEqual([]);
  });
});
