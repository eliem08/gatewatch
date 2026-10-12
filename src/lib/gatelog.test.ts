import { describe, it, expect } from 'vitest';
import { computeStats, bucketByHour, makeId, type GateEntry } from './gatelog';

const mk = (ts: string, result: GateEntry['result'], ms: number): GateEntry => ({
  id: makeId(),
  ts: new Date(ts).getTime(),
  image: 'sample',
  plate: '78452-A-17',
  container: 'MSKU7392017',
  isoValid: true,
  result,
  processingMs: ms,
});

describe('gatelog', () => {
  it('computes stats for empty entries', () => {
    expect(computeStats([])).toEqual({
      total: 0,
      trucksPerHour: 0,
      avgProcessingMs: 0,
      mismatchRate: 0,
      matches: 0,
      mismatches: 0,
    });
  });

  it('computes stats for entries over 2 hours', () => {
    const entries: GateEntry[] = [
      mk('2026-10-12T08:00:00', 'match', 1000),
      mk('2026-10-12T08:30:00', 'container-mismatch', 2000),
      mk('2026-10-12T09:00:00', 'match', 3000),
      mk('2026-10-12T10:00:00', 'match', 4000),
    ];
    const stats = computeStats(entries);
    expect(stats.total).toBe(4);
    expect(stats.trucksPerHour).toBe(2);
    expect(stats.avgProcessingMs).toBe(2500);
    expect(stats.mismatchRate).toBe(0.25);
  });

  it('buckets entries by hour', () => {
    const entries: GateEntry[] = [
      mk('2026-10-12T08:10:00', 'match', 1000),
      mk('2026-10-12T08:40:00', 'match', 1000),
      mk('2026-10-12T09:05:00', 'match', 1000),
    ];
    expect(bucketByHour(entries)).toEqual([
      { hour: '08:00', count: 2 },
      { hour: '09:00', count: 1 },
    ]);
  });

  it('makes unique non-empty ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = makeId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });
});
