import { describe, it, expect } from 'vitest';
import {
  needsReview,
  routeScan,
  createReviewItem,
  applyReviewDecision,
  computeAccuracy,
  DEFAULT_REVIEW_THRESHOLD,
} from './review';

describe('review queue', () => {
  it('routes below-threshold scans to review, passes at-threshold scans', () => {
    expect(needsReview(69.9, 70)).toBe(true);
    expect(needsReview(70, 70)).toBe(false);
    expect(needsReview(95, 70)).toBe(false);
    expect(DEFAULT_REVIEW_THRESHOLD).toBe(70);
  });

  it('treats non-finite confidence as needing review, never as a pass', () => {
    // Regression: `NaN < threshold` is false, which used to silently
    // auto-accept a corrupt read. Non-finite confidence must route to a human.
    expect(needsReview(NaN, 70)).toBe(true);
    expect(needsReview(Infinity, 70)).toBe(true);
    expect(needsReview(-Infinity, 70)).toBe(true);
  });

  describe('routeScan — OCR failure / low confidence can never auto-accept', () => {
    const T = DEFAULT_REVIEW_THRESHOLD;

    it('routes an OCR engine failure to scan-failed, never auto-accept', () => {
      expect(routeScan({ error: 'OCR engine failed to load', confidence: 99 }, T)).toBe('scan-failed');
      expect(routeScan({ error: 'Could not decode that image.', confidence: 0 }, T)).toBe('scan-failed');
    });

    it('routes below-threshold reads to human-review, never auto-accept', () => {
      expect(routeScan({ error: null, confidence: 0 }, T)).toBe('human-review');
      expect(routeScan({ error: null, confidence: 69.9 }, T)).toBe('human-review');
      // Empty read with middling confidence is still a human's call.
      expect(routeScan({ error: null, confidence: 40 }, T)).toBe('human-review');
    });

    it('routes non-finite confidence to human-review, never auto-accept', () => {
      expect(routeScan({ error: null, confidence: NaN }, T)).toBe('human-review');
      expect(routeScan({ error: null, confidence: Infinity }, T)).toBe('human-review');
    });

    it('auto-accepts only clean reads at or above the threshold', () => {
      expect(routeScan({ error: null, confidence: 70 }, T)).toBe('auto-accept');
      expect(routeScan({ error: null, confidence: 95 }, T)).toBe('auto-accept');
      expect(routeScan({ error: null, confidence: 100 }, T)).toBe('auto-accept');
    });

    it('an error beats a high confidence — failure is never overridden', () => {
      // Even a confident-looking read is failed when the engine reported an error.
      expect(routeScan({ error: 'worker crashed mid-pass', confidence: 100 }, T)).toBe('scan-failed');
    });

    it('enumerates every routing outcome — no hidden fourth path', () => {
      const seen = new Set([
        routeScan({ error: 'x', confidence: 50 }, T),
        routeScan({ error: null, confidence: 10 }, T),
        routeScan({ error: null, confidence: 90 }, T),
      ]);
      expect(seen).toEqual(new Set(['scan-failed', 'human-review', 'auto-accept']));
    });
  });

  it('creates pending items seeded with the OCR read', () => {
    const item = createReviewItem({
      batchId: 'batch-1',
      imageName: 'truck.jpg',
      imageUrl: '/truck.jpg',
      ocrPlate: '78452-A-17',
      ocrContainer: 'MSKU7392017',
      confidence: 52,
    });
    expect(item.status).toBe('pending');
    expect(item.plate).toBe('78452-A-17');
    expect(item.container).toBe('MSKU7392017');
    expect(item.decidedAt).toBeNull();
  });

  it('approving keeps the OCR values', () => {
    const item = createReviewItem({
      batchId: 'b1',
      imageName: 't.jpg',
      imageUrl: '/t.jpg',
      ocrPlate: '78452-A-17',
      ocrContainer: 'MSKU7392017',
      confidence: 40,
    });
    const next = applyReviewDecision([item], item.id, { kind: 'approve' });
    expect(next[0].status).toBe('approved');
    expect(next[0].plate).toBe('78452-A-17');
    expect(next[0].decidedAt).not.toBeNull();
  });

  it('correcting stores operator values and counts as corrected', () => {
    const item = createReviewItem({
      batchId: 'b1',
      imageName: 't.jpg',
      imageUrl: '/t.jpg',
      ocrPlate: '78452-A-17',
      ocrContainer: 'MSKU7392017',
      confidence: 40,
    });
    const next = applyReviewDecision([item], item.id, {
      kind: 'correct',
      plate: '78452-A-18',
      container: 'MSKU7392017',
    });
    expect(next[0].status).toBe('corrected');
    expect(next[0].plate).toBe('78452-A-18');
  });

  it('saving identical values counts as approval, not correction', () => {
    const item = createReviewItem({
      batchId: 'b1',
      imageName: 't.jpg',
      imageUrl: '/t.jpg',
      ocrPlate: '78452-A-17',
      ocrContainer: 'MSKU7392017',
      confidence: 40,
    });
    const next = applyReviewDecision([item], item.id, {
      kind: 'correct',
      plate: '78452-A-17',
      container: 'MSKU7392017',
    });
    expect(next[0].status).toBe('approved');
  });

  it('computes auto-accept and correction rates', () => {
    const mk = (status: 'pending' | 'approved' | 'corrected', confidence: number) => ({
      ...createReviewItem({
        batchId: 'b',
        imageName: 't.jpg',
        imageUrl: '/t.jpg',
        ocrPlate: 'P',
        ocrContainer: 'C',
        confidence,
      }),
      status,
      decidedAt: status === 'pending' ? null : 1,
    });
    const acc = computeAccuracy({
      totalScans: 10,
      reviewItems: [mk('approved', 50), mk('corrected', 60), mk('pending', 40)],
    });
    expect(acc.autoAccepted).toBe(7);
    expect(acc.autoAcceptRate).toBeCloseTo(0.7);
    expect(acc.reviewed).toBe(2);
    expect(acc.corrected).toBe(1);
    expect(acc.correctionRate).toBeCloseTo(0.5);
    expect(acc.avgReviewConfidence).toBeCloseTo(50);
  });

  it('handles zero scans without NaN', () => {
    const acc = computeAccuracy({ totalScans: 0, reviewItems: [] });
    expect(acc.autoAcceptRate).toBe(0);
    expect(acc.correctionRate).toBe(0);
    expect(acc.avgReviewConfidence).toBe(0);
  });
});
