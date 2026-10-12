/**
 * Canvas-free pure helpers for the OCR preprocessing pipeline.
 * Operate on Uint8ClampedArray RGBA data + width/height so they are
 * unit-testable without DOM.
 */

/**
 * Converts RGBA data to grayscale using luminance.
 * @param data RGBA pixel data.
 * @returns grayscale array (one byte per pixel).
 */
export function toGrayscale(data: Uint8ClampedArray): Uint8ClampedArray {
  const len = data.length / 4;
  const out = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return out;
}

/**
 * Stretches contrast using 2nd and 98th percentiles.
 * @param gray grayscale array.
 * @param width image width.
 * @param height image height.
 * @returns new grayscale array.
 */
export function contrastStretch(
  gray: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const total = width * height;
  const hist = new Uint32Array(256);
  for (let i = 0; i < total; i++) {
    hist[gray[i]]++;
  }

  const lowTarget = total * 0.02;
  const highTarget = total * 0.98;
  let low = 0;
  let high = 255;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowTarget) {
      low = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= highTarget) {
      high = i;
      break;
    }
  }

  const range = high - low;
  if (range <= 0) {
    // Constant image: nothing to stretch; return unchanged.
    return gray.slice();
  }
  const out = new Uint8ClampedArray(total);
  for (let i = 0; i < total; i++) {
    out[i] = Math.round(((gray[i] - low) / range) * 255);
  }
  return out;
}

/**
 * Computes Otsu's threshold for a grayscale image.
 * @param gray grayscale array.
 * @returns threshold 0-255.
 */
export function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i]]++;
  }

  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * hist[i];
  }

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);

    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Applies a binary threshold to a grayscale image.
 * @param gray grayscale array.
 * @param t threshold 0-255.
 * @returns binary array (0 or 255).
 */
export function applyThreshold(gray: Uint8ClampedArray, t: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] > t ? 255 : 0;
  }
  return out;
}

/**
 * Nearest-neighbor upscale of a grayscale image.
 * @param gray grayscale array.
 * @param w width.
 * @param h height.
 * @param factor scale factor (default 2).
 * @returns upscaled data and dimensions.
 */
export function upscaleGray(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  factor = 2
): { data: Uint8ClampedArray; w: number; h: number } {
  const nw = w * factor;
  const nh = h * factor;
  const out = new Uint8ClampedArray(nw * nh);
  for (let y = 0; y < nh; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < nw; x++) {
      const sx = Math.floor(x / factor);
      out[y * nw + x] = gray[sy * w + sx];
    }
  }
  return { data: out, w: nw, h: nh };
}

export type PreprocessOptions = {
  grayscale: boolean;
  contrast: boolean;
  threshold: 'none' | 'otsu';
  upscale: boolean;
};

export const DEFAULT_OPTIONS: PreprocessOptions = {
  grayscale: true,
  contrast: true,
  threshold: 'otsu',
  upscale: true,
};

/**
 * Runs the full preprocessing pipeline.
 * @param data input RGBA or grayscale data.
 * @param w width.
 * @param h height.
 * @param opts preprocessing options.
 * @returns processed data and dimensions.
 */
export function runPipeline(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  opts: PreprocessOptions
): { data: Uint8ClampedArray; w: number; h: number } {
  let current = data;
  let width = w;
  let height = h;

  if (opts.grayscale) {
    current = toGrayscale(current);
  }

  if (opts.contrast) {
    current = contrastStretch(current, width, height);
  }

  if (opts.threshold === 'otsu') {
    const t = otsuThreshold(current);
    current = applyThreshold(current, t);
  }

  if (opts.upscale) {
    const up = upscaleGray(current, width, height);
    current = up.data;
    width = up.w;
    height = up.h;
  }

  return { data: current, w: width, h: height };
}
