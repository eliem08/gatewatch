import { describe, it, expect } from 'vitest';
import {
  createBatchQueue,
  nextQueuedItem,
  updateBatchItem,
  batchSummary,
} from './batch';

describe('batch queue', () => {
  it('creates a queue in insertion order, all queued', () => {
    const q = createBatchQueue([
      { name: 'a.jpg', url: '/a.jpg' },
      { name: 'b.jpg', url: '/b.jpg' },
    ]);
    expect(q).toHaveLength(2);
    expect(q.map((i) => i.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(q.every((i) => i.status === 'queued')).toBe(true);
    expect(q.every((i) => i.lane === null)).toBe(true);
    expect(new Set(q.map((i) => i.id)).size).toBe(2);
  });

  it('returns the first queued item (FIFO)', () => {
    const q = createBatchQueue([
      { name: 'a.jpg', url: '/a.jpg' },
      { name: 'b.jpg', url: '/b.jpg' },
      { name: 'c.jpg', url: '/c.jpg' },
    ]);
    expect(nextQueuedItem(q)?.name).toBe('a.jpg');
    const advanced = updateBatchItem(q, q[0].id, { status: 'done' });
    expect(nextQueuedItem(advanced)?.name).toBe('b.jpg');
  });

  it('skips done and failed items when picking next', () => {
    const q = createBatchQueue([
      { name: 'a.jpg', url: '/a.jpg' },
      { name: 'b.jpg', url: '/b.jpg' },
    ]);
    const step1 = updateBatchItem(q, q[0].id, { status: 'failed', error: 'boom' });
    const step2 = updateBatchItem(step1, q[1].id, { status: 'processing' });
    expect(nextQueuedItem(step2)).toBeUndefined();
  });

  it('updates one item without reordering or touching others', () => {
    const q = createBatchQueue([
      { name: 'a.jpg', url: '/a.jpg' },
      { name: 'b.jpg', url: '/b.jpg' },
    ]);
    const next = updateBatchItem(q, q[1].id, {
      status: 'processing',
      lane: 2,
      plate: '78452-A-17',
    });
    expect(next[0]).toBe(q[0]);
    expect(next[1].status).toBe('processing');
    expect(next[1].lane).toBe(2);
    expect(next[1].plate).toBe('78452-A-17');
    expect(next.map((i) => i.name)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('summarizes counts and average processing time', () => {
    const q = createBatchQueue([
      { name: 'a.jpg', url: '/a.jpg' },
      { name: 'b.jpg', url: '/b.jpg' },
      { name: 'c.jpg', url: '/c.jpg' },
      { name: 'd.jpg', url: '/d.jpg' },
    ]);
    let s = updateBatchItem(q, q[0].id, { status: 'done', processingMs: 1000 });
    s = updateBatchItem(s, q[1].id, { status: 'done', processingMs: 3000 });
    s = updateBatchItem(s, q[2].id, { status: 'failed', error: 'x' });
    expect(batchSummary(s)).toEqual({
      total: 4,
      queued: 1,
      processing: 0,
      done: 2,
      failed: 1,
      avgProcessingMs: 2000,
    });
    expect(batchSummary([]).avgProcessingMs).toBe(0);
  });
});
