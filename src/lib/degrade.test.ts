import { describe, it, expect } from 'vitest';
import {
  addGaussianNoise,
  reduceContrast,
  addOcclusionBars,
  applyDegradation,
  mulberry32,
} from './degrade';

describe('degrade', () => {
  it('PRNG is deterministic per seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('noise is seeded-deterministic and preserves dimensions/range', () => {
    const gray = new Uint8ClampedArray(100).fill(128);
    const n1 = addGaussianNoise(gray, 25, 42);
    const n2 = addGaussianNoise(gray, 25, 42);
    const n3 = addGaussianNoise(gray, 25, 43);
    expect(Array.from(n1)).toEqual(Array.from(n2));
    expect(Array.from(n1)).not.toEqual(Array.from(n3));
    expect(Math.min(...n1)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...n1)).toBeLessThanOrEqual(255);
    // Noise actually changes pixels.
    expect(n1.some((v) => v !== 128)).toBe(true);
  });

  it('low-contrast compresses the intensity range', () => {
    const gray = new Uint8ClampedArray([0, 255, 0, 255]);
    const out = reduceContrast(gray, 0.4);
    expect(Math.min(...out)).toBeGreaterThan(0);
    expect(Math.max(...out)).toBeLessThan(255);
  });

  it('occlusion bars paint 200 and leave the rest untouched', () => {
    const w = 30;
    const h = 10;
    const gray = new Uint8ClampedArray(w * h).fill(50);
    const out = addOcclusionBars(gray, w, h);
    const barX = Math.round(w / 3);
    expect(out[5 * w + barX]).toBe(200);
    expect(out[5 * w + 0]).toBe(50);
    expect(out[5 * w + (w - 1)]).toBe(50);
  });

  it('applyDegradation none is a copy; rotate keeps dimensions', () => {
    const w = 20;
    const h = 12;
    const gray = new Uint8ClampedArray(w * h).fill(100);
    const none = applyDegradation(gray, w, h, 'none');
    expect(none).not.toBe(gray);
    expect(Array.from(none)).toEqual(Array.from(gray));
    const rotated = applyDegradation(gray, w, h, 'rotate');
    expect(rotated.length).toBe(w * h);
  });
});
