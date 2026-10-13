import { describe, it, expect } from 'vitest';
import {
  histogramEqualize,
  clahe,
  medianDenoise,
  adaptiveThreshold,
  estimateSkewAngle,
  rotateGray,
  boxBlur,
} from './advancedPreprocess';

function twoLevel(): { gray: Uint8ClampedArray; w: number; h: number } {
  // 10×10: left half 50, right half 200.
  const w = 10;
  const h = 10;
  const gray = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      gray[y * w + x] = x < 5 ? 50 : 200;
    }
  }
  return { gray, w, h };
}

describe('advancedPreprocess', () => {
  it('histogram equalization spreads two levels to 0 and 255', () => {
    const { gray } = twoLevel();
    const out = histogramEqualize(gray);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
  });

  it('CLAHE keeps dimensions and range, and spreads a two-level image', () => {
    // 80×80 (not 10×10): with 1×1 tiles every tile is homogeneous and
    // CLAHE degenerately maps its single value to 255; real tiles hold
    // ~100 pixels, where the clip limit keeps levels distinct.
    const w = 80;
    const h = 80;
    const gray = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) gray[y * w + x] = x < w / 2 ? 50 : 200;
    }
    const out = clahe(gray, w, h);
    expect(out.length).toBe(w * h);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...out)).toBeLessThanOrEqual(255);
    // Two distinct input levels must stay distinct after CLAHE.
    expect(new Set(out).size).toBeGreaterThan(1);
  });

  it('median denoise removes an isolated salt spike', () => {
    const w = 5;
    const h = 5;
    const gray = new Uint8ClampedArray(w * h).fill(0);
    gray[2 * w + 2] = 255; // isolated spike
    const out = medianDenoise(gray, w, h);
    expect(out[2 * w + 2]).toBe(0);
  });

  it('median denoise preserves a solid edge', () => {
    const w = 6;
    const h = 6;
    const gray = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) gray[y * w + x] = x < 3 ? 0 : 255;
    }
    const out = medianDenoise(gray, w, h);
    // Interior pixels either side of the step stay on their side.
    expect(out[2 * w + 1]).toBe(0);
    expect(out[2 * w + 4]).toBe(255);
  });

  it('adaptive threshold finds ink on a brightness gradient', () => {
    const w = 40;
    const h = 20;
    const gray = new Uint8ClampedArray(w * h);
    // Background gradient 60 → 200; dark bar (value 20) across the middle.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        gray[y * w + x] = Math.round(60 + (x / (w - 1)) * 140);
      }
    }
    for (let x = 0; x < w; x++) gray[10 * w + x] = 20;
    const out = adaptiveThreshold(gray, w, h, 15, 10);
    // Bar is ink everywhere, including on the bright side.
    expect(out[10 * w + 35]).toBe(0);
    // Bright background stays paper.
    expect(out[2 * w + 35]).toBe(255);
    // Dark background (left) stays paper where there is no bar.
    expect(out[2 * w + 2]).toBe(255);
  });

  it('box blur spreads an impulse', () => {
    const w = 5;
    const h = 5;
    const gray = new Uint8ClampedArray(w * h).fill(0);
    gray[2 * w + 2] = 255;
    const out = boxBlur(gray, w, h);
    expect(out[2 * w + 2]).toBeLessThan(255);
    expect(out[2 * w + 2]).toBeGreaterThan(0);
    expect(out[1 * w + 2]).toBeGreaterThan(0);
  });

  it('rotateGray is identity at 0 degrees', () => {
    const w = 4;
    const h = 3;
    const gray = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Array.from(rotateGray(gray, w, h, 0))).toEqual(Array.from(gray));
  });

  it('Hough skew estimation recovers a +3° rotation', () => {
    const w = 200;
    const h = 120;
    const gray = new Uint8ClampedArray(w * h).fill(255);
    // Three horizontal text-like bars.
    for (const y0 of [30, 60, 90]) {
      for (let y = y0; y < y0 + 6; y++) {
        for (let x = 20; x < 180; x++) gray[y * w + x] = 0;
      }
    }
    const rotated = rotateGray(gray, w, h, 3);
    const angle = estimateSkewAngle(rotated, w, h);
    expect(angle).toBeGreaterThanOrEqual(2);
    expect(angle).toBeLessThanOrEqual(4);
  });

  it('Hough skew estimation returns ~0 for level text and blank images', () => {
    const w = 200;
    const h = 120;
    const gray = new Uint8ClampedArray(w * h).fill(255);
    for (const y0 of [30, 60, 90]) {
      for (let y = y0; y < y0 + 6; y++) {
        for (let x = 20; x < 180; x++) gray[y * w + x] = 0;
      }
    }
    expect(Math.abs(estimateSkewAngle(gray, w, h))).toBeLessThanOrEqual(0.5);
    const blank = new Uint8ClampedArray(w * h).fill(255);
    expect(estimateSkewAngle(blank, w, h)).toBe(0);
  });
});
