/**
 * Synthetic image degradations for the evaluation harness. Each takes a
 * grayscale image and returns a degraded copy — same dimensions, same
 * type. A seeded PRNG (mulberry32) keeps every degradation reproducible:
 * the same (image, kind, seed) always produces the same pixels, so
 * benchmark runs are comparable across sessions.
 */
import { boxBlur, rotateGray } from './advancedPreprocess';

/** Deterministic PRNG: mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DegradationKind =
  | 'none'
  | 'noise'
  | 'blur'
  | 'rotate'
  | 'low-contrast'
  | 'occlusion';

export const DEGRADATIONS: Array<{
  kind: DegradationKind;
  label: string;
  description: string;
}> = [
  { kind: 'none', label: 'Clean', description: 'No degradation — the control condition.' },
  { kind: 'noise', label: 'Gaussian noise', description: 'Additive Gaussian noise, σ = 25. Simulates sensor noise / low light.' },
  { kind: 'blur', label: 'Blur', description: '3×3 box blur ×2. Simulates slight defocus / motion.' },
  { kind: 'rotate', label: 'Rotation +4°', description: 'Rotate +4° (clockwise). Simulates a tilted camera / skewed plate.' },
  { kind: 'low-contrast', label: 'Low contrast', description: 'Compress intensities to 40% of range around the mean. Simulates glare / fog / faded paint.' },
  { kind: 'occlusion', label: 'Occlusion bars', description: 'Two opaque vertical bars. Simulates a wiper, dirt, or a partial obstruction.' },
];

/** Gaussian noise via Box–Muller on the seeded PRNG. */
export function addGaussianNoise(
  gray: Uint8ClampedArray,
  sigma = 25,
  seed = 42,
): Uint8ClampedArray {
  const rand = mulberry32(seed);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    // Box–Muller: two uniform draws → one standard normal.
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    out[i] = Math.min(255, Math.max(0, Math.round(gray[i] + z * sigma)));
  }
  return out;
}

/** Compresses the intensity range to `factor` of its width around the mean. */
export function reduceContrast(
  gray: Uint8ClampedArray,
  factor = 0.4,
): Uint8ClampedArray {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.min(255, Math.max(0, Math.round(mean + (gray[i] - mean) * factor)));
  }
  return out;
}

/**
 * Paints two opaque vertical bars (value 200, like a wiper shadow) over
 * the image at 1/3 and 2/3 width, each ~4% of the width.
 */
export function addOcclusionBars(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = gray.slice();
  const barW = Math.max(1, Math.round(w * 0.04));
  for (const frac of [1 / 3, 2 / 3]) {
    const x0 = Math.round(w * frac);
    for (let y = 0; y < h; y++) {
      for (let x = x0; x < Math.min(w, x0 + barW); x++) {
        out[y * w + x] = 200;
      }
    }
  }
  return out;
}

/**
 * Applies one named degradation. `seed` only affects the stochastic
 * kinds (noise); the rest are deterministic by construction.
 */
export function applyDegradation(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  kind: DegradationKind,
  seed = 42,
): Uint8ClampedArray {
  switch (kind) {
    case 'none':
      return gray.slice();
    case 'noise':
      return addGaussianNoise(gray, 25, seed);
    case 'blur':
      return boxBlur(boxBlur(gray, w, h), w, h);
    case 'rotate':
      return rotateGray(gray, w, h, 4);
    case 'low-contrast':
      return reduceContrast(gray, 0.4);
    case 'occlusion':
      return addOcclusionBars(gray, w, h);
    default:
      return gray.slice();
  }
}
