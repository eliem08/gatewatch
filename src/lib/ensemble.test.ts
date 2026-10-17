import { describe, it, expect } from 'vitest';
import { combineEngineReads, voteCandidates, type EngineRead } from './ensemble';

function read(psm: string, text: string, confidence = 80, ms = 100): EngineRead {
  return { psm, text, confidence, ms };
}

describe('ensemble', () => {
  it('majority vote wins the plate field', () => {
    const result = combineEngineReads([
      read('6', 'plate 78452-A-17 container MSKU7392017', 80),
      read('7', 'plate 78452-A-17 container MSKU7392017', 85),
      read('11', 'plate 78452-A-18 container MSKU7392017', 70),
    ]);
    expect(result.plate.value).toBe('78452-A-17');
    expect(result.plate.votes).toBe(2);
    expect(result.container.value).toBe('MSKU7392017');
    expect(result.container.votes).toBe(3);
  });

  it('confidence weight breaks a vote tie', () => {
    const result = combineEngineReads([
      read('6', 'MSKU7392017', 50),
      read('7', 'MSKU7392017', 50),
      read('11', 'MSKU7392018', 90),
      read('13', 'MSKU7392018', 90),
    ]);
    // 2 vs 2 votes; 180 vs 100 total confidence → the 8-ending wins.
    expect(result.container.value).toBe('MSKU7392018');
  });

  it('agreement is 1 when engines are unanimous, 0 when nothing found', () => {
    const unanimous = combineEngineReads([
      read('6', 'MSKU7392017', 80),
      read('11', 'MSKU7392017', 80),
    ]);
    expect(unanimous.agreement).toBe(1);
    const empty = combineEngineReads([read('6', 'no fields here', 50)]);
    expect(empty.plate.value).toBe('');
    expect(empty.agreement).toBe(0);
  });

  it('voteCandidates abstains cleanly with no votes', () => {
    const v = voteCandidates([]);
    expect(v.value).toBe('');
    expect(v.votes).toBe(0);
    expect(v.candidates).toEqual([]);
  });

  it('degraded mode: total engine failure yields empty fields, never a hallucinated read', () => {
    // All engines threw / produced nothing: the ensemble must abstain with
    // empty winners and zero agreement — downstream routing (routeScan)
    // then sends the item to human review or the failed path. It must
    // never invent a plate or container from nothing.
    const result = combineEngineReads([]);
    expect(result.plate.value).toBe('');
    expect(result.container.value).toBe('');
    expect(result.agreement).toBe(0);
    expect(result.perEngine).toEqual([]);
    expect(result.combinedText).toBe('');
  });

  it('degraded mode: zero-confidence reads do not outvote real candidates', () => {
    // A zero-confidence engine that hallucinates a plate must not beat a
    // confident engine: confidence-weighted voting puts the 0-weight
    // candidate last even when both engines voted.
    const result = combineEngineReads([
      read('6', 'plate 00000-Z-00', 0),
      read('11', 'plate 78452-A-17', 60),
    ]);
    expect(result.plate.value).toBe('78452-A-17');
    expect(result.agreement).toBeLessThan(1);
  });
});
