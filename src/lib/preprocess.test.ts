import { describe, it, expect } from 'vitest';
import {
  toGrayscale,
  contrastStretch,
  otsuThreshold,
  applyThreshold,
  upscaleGray,
  runPipeline,
  DEFAULT_OPTIONS,
} from './preprocess';

describe('preprocess', () => {
  it('converts RGBA to grayscale', () => {
    const red = toGrayscale(new Uint8ClampedArray([255, 0, 0, 255]));
    expect(red[0]).toBeCloseTo(76, 0);
    const white = toGrayscale(new Uint8ClampedArray([255, 255, 255, 255]));
    expect(white[0]).toBe(255);
    const black = toGrayscale(new Uint8ClampedArray([0, 0, 0, 255]));
    expect(black[0]).toBe(0);
  });

  it('computes Otsu threshold', () => {
    // Two spread clusters: dark (10..60) and bright (180..240).
    const arr = new Uint8ClampedArray(100);
    for (let i = 0; i < 50; i++) arr[i] = 10 + i;
    for (let i = 50; i < 100; i++) arr[i] = 180 + (i - 50);
    const t = otsuThreshold(arr);
    // Any threshold separating the clusters (59 < t < 180) is optimal;
    // the algorithm returns the first maximizer.
    expect(t).toBeGreaterThanOrEqual(59);
    expect(t).toBeLessThan(180);
  });

  it('applies threshold', () => {
    const out = applyThreshold(new Uint8ClampedArray([0, 100, 200, 255]), 128);
    expect(Array.from(out)).toEqual([0, 0, 255, 255]);
  });

  it('upscales grayscale image', () => {
    const input = new Uint8ClampedArray([1, 2, 3, 4]);
    const result = upscaleGray(input, 2, 2, 2);
    expect(result.w).toBe(4);
    expect(result.h).toBe(4);
    expect(result.data.length).toBe(16);
    expect(result.data[0]).toBe(1);
    expect(result.data[1]).toBe(1);
    expect(result.data[4]).toBe(1);
  });

  it('runs pipeline with default options', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128;
      data[i + 1] = 128;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
    const result = runPipeline(data, 4, 4, DEFAULT_OPTIONS);
    // DEFAULT_OPTIONS upscales 2x; pipeline output is 1 byte/pixel (grayscale).
    expect(result.w).toBe(8);
    expect(result.h).toBe(8);
    expect(result.data.length).toBe(8 * 8);
  });

  it('contrast stretch handles constant image without NaN', () => {
    const out = contrastStretch(new Uint8ClampedArray([128, 128, 128, 128]), 2, 2);
    expect(out.length).toBe(4);
    for (let i = 0; i < out.length; i++) {
      expect(Number.isNaN(out[i])).toBe(false);
    }
    expect(out[0]).toBeCloseTo(128, 0);
  });
});
