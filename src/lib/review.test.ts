import { describe, it, expect } from 'vitest';
import {
  needsReview,
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
