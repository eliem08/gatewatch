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

  it('accepts 2-letter series', () => {
    expect(isPlausiblePlate('78452-AB-17')).toBe(true);
    expect(isPlausiblePlate('1234-ZZ-9')).toBe(true);
    expect(extractPlateCandidates('truck 78452-AB-17 cleared')).toEqual(['78452-AB-17']);
  });

  it('accepts 4-digit plates', () => {
    expect(isPlausiblePlate('1234-A-56')).toBe(true);
    expect(extractPlateCandidates('plate 1234-A-56')).toEqual(['1234-A-56']);
  });

  it('accepts WW temporary plates in both orders', () => {
    expect(isPlausiblePlate('WW-123456')).toBe(true);
    expect(isPlausiblePlate('123456-WW')).toBe(true);
    expect(normalizePlate('WW 123456')).toBe('WW-123456');
    expect(normalizePlate('123456 WW')).toBe('123456-WW');
    expect(extractPlateCandidates('temp plate WW-123456 issued')).toEqual(['WW-123456']);
    expect(extractPlateCandidates('temp plate 123456-WW issued')).toEqual(['123456-WW']);
  });

  it('accepts validated region suffixes, rejects unknown trailing words', () => {
    expect(isPlausiblePlate('78452-A-17-CAS')).toBe(true);
    expect(isPlausiblePlate('78452-A-17-RAB')).toBe(true);
    expect(isPlausiblePlate('78452-A-17-SEEN')).toBe(false);
    expect(extractPlateCandidates('plate 78452-A-17-CAS cleared')).toEqual(['78452-A-17-CAS']);
    // A plain trailing word is OCR noise, not a region code.
    expect(extractPlateCandidates('plate 78452-A-17 seen')).toEqual(['78452-A-17']);
  });

  it('dedupes repeated plates', () => {
    expect(extractPlateCandidates('78452-A-17 and 78452-A-17 again')).toEqual(['78452-A-17']);
  });
});
