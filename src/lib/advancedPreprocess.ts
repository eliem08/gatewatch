/**
 * Advanced preprocessing: histogram equalization, CLAHE, median denoising,
 * adaptive thresholding, Hough-based deskew, and rotation.
 *
 * All functions are pure (Uint8ClampedArray grayscale + width/height) so
 * they are unit-testable without DOM. Canvas I/O lives in `ocr.ts`.
 */

/**
 * Global histogram equalization: spreads intensities across 0–255.
 * Good for washed-out captures; can amplify noise in flat regions —
 * prefer CLAHE when the background is noisy.
 */
export function histogramEqualize(gray: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const cdf = new Uint32Array(256);
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    cdf[i] = acc;
  }
  // First non-zero CDF value (avoids mapping empty bins to >0).
  let cdfMin = 0;
  for (let i = 0; i < 256; i++) {
    if (cdf[i] > 0) {
      cdfMin = cdf[i];
      break;
    }
  }
  const total = gray.length;
  const denom = total - cdfMin;
  const out = new Uint8ClampedArray(total);
  if (denom <= 0) return gray.slice();
  for (let i = 0; i < total; i++) {
    out[i] = Math.round(((cdf[gray[i]] - cdfMin) / denom) * 255);
  }
  return out;
}

/**
 * Contrast-Limited Adaptive Histogram Equalization (CLAHE-lite).
 * Splits the image into tiles, equalizes each tile's histogram with a
 * clip limit (excess redistributed uniformly), then bilinearly
 * interpolates the tile mappings so tile borders do not show.
 *
 * @param gray grayscale input.
 * @param w width.
 * @param h height.
 * @param tiles tiles per axis (default 8).
 * @param clipLimit clip as a multiple of the tile's mean bin count
 *   (default 2.0). Higher = closer to plain adaptive equalization.
 */
export function clahe(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  tiles = 8,
  clipLimit = 2.0,
): Uint8ClampedArray {
  const tw = Math.max(1, Math.floor(w / tiles));
  const th = Math.max(1, Math.floor(h / tiles));
  const tilesX = Math.ceil(w / tw);
  const tilesY = Math.ceil(h / th);
  // Per-tile lookup tables: maps[tileY][tileX][value] -> equalized value.
  const maps: Uint8ClampedArray[][] = [];
  for (let ty = 0; ty < tilesY; ty++) {
    const row: Uint8ClampedArray[] = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tw;
      const y0 = ty * th;
      const x1 = Math.min(w, x0 + tw);
      const y1 = Math.min(h, y0 + th);
      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[gray[y * w + x]]++;
          count++;
        }
      }
      // Clip + redistribute excess uniformly.
      const clip = Math.max(1, Math.floor((count / 256) * clipLimit));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clip) {
          excess += hist[i] - clip;
          hist[i] = clip;
        }
      }
      const spread = Math.floor(excess / 256);
      let rem = excess - spread * 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += spread;
        if (rem > 0) {
          hist[i]++;
          rem--;
        }
      }
      // CDF → lookup.
      const lut = new Uint8ClampedArray(256);
      let acc = 0;
      for (let i = 0; i < 256; i++) {
        acc += hist[i];
        lut[i] = count > 0 ? Math.round((acc / count) * 255) : i;
      }
      row.push(lut);
    }
    maps.push(row);
  }

  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    // Tile coordinates of the pixel centre, in tile-index space.
    const tyf = (y + 0.5) / th - 0.5;
    const ty0 = Math.max(0, Math.floor(tyf));
    const ty1 = Math.min(tilesY - 1, ty0 + 1);
    const fy = Math.min(1, Math.max(0, tyf - ty0));
    for (let x = 0; x < w; x++) {
      const txf = (x + 0.5) / tw - 0.5;
      const tx0 = Math.max(0, Math.floor(txf));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const fx = Math.min(1, Math.max(0, txf - tx0));
      const v = gray[y * w + x];
      const v00 = maps[ty0][tx0][v];
      const v10 = maps[ty0][tx1][v];
      const v01 = maps[ty1][tx0][v];
      const v11 = maps[ty1][tx1][v];
      const top = v00 + (v10 - v00) * fx;
      const bottom = v01 + (v11 - v01) * fx;
      out[y * w + x] = Math.round(top + (bottom - top) * fy);
    }
  }
  return out;
}

/**
 * 3×3 median filter: removes salt-and-pepper noise while preserving edges
 * (unlike a blur, it does not smear stroke boundaries).
 * Border pixels are copied unchanged.
 */
export function medianDenoise(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = gray.slice();
  const window = new Array<number>(9);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          window[k++] = gray[(y + dy) * w + (x + dx)];
        }
      }
      window.sort((a, b) => a - b);
      out[y * w + x] = window[4];
    }
  }
  return out;
}

/**
 * Local-mean adaptive threshold (a Sauvola-style method without the
 * standard-deviation term): a pixel is ink when it is darker than the
 * mean of its neighbourhood minus a constant C. Handles uneven
 * illumination that defeats a single global (Otsu) threshold.
 *
 * @param window neighbourhood size (odd, default 15).
 * @param c constant subtracted from the local mean (default 10).
 */
export function adaptiveThreshold(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  window = 15,
  c = 10,
): Uint8ClampedArray {
  // Integral image for O(1) neighbourhood means.
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] =
        integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const half = Math.floor(window / 2);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / area;
      out[y * w + x] = gray[y * w + x] < mean - c ? 0 : 255;
    }
  }
  return out;
}

/**
 * 3×3 box blur (mean filter). Used for the benchmark's blur degradation
 * and as a building block for denoise comparisons. Border pixels copied.
 */
export function boxBlur(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = gray.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += gray[(y + dy) * w + (x + dx)];
        }
      }
      out[y * w + x] = Math.round(sum / 9);
    }
  }
  return out;
}

/**
 * Estimates the skew angle of text lines via a Hough-style accumulator.
 *
 * A text line has direction angle φ (φ = 0 → perfectly horizontal). In
 * Hough form, points on the line satisfy ρ = x·cos θ + y·sin θ where θ
 * is the angle of the line's NORMAL, θ = φ + 90°. For near-horizontal
 * text, θ is near 90°, so we scan θ ∈ [78°, 102°] (φ ∈ [−12°, +12°]):
 * at the true normal angle the votes concentrate into a few ρ bins, and
 * the score Σ(votes²) peaks. The image is downsampled first (default
 * target width 200) to keep the vote count tractable.
 *
 * Sign convention: a POSITIVE returned angle means text lines slope
 * downward to the right (image coordinates, y grows downward). To deskew,
 * rotate the image by −angle.
 *
 * @param gray grayscale input.
 * @param w width.
 * @param h height.
 * @param threshold binarization threshold; pixels ≤ threshold count as ink.
 *   Defaults to Otsu's threshold on the input.
 * @returns estimated skew angle in degrees, in [−maxAngle, +maxAngle].
 */
export function estimateSkewAngle(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  threshold?: number,
  maxAngle = 12,
  step = 0.5,
): number {
  // Otsu on the input (import-free: small local implementation).
  let t = threshold;
  if (t === undefined) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    t = 0;
    for (let tt = 0; tt < 256; tt++) {
      wB += hist[tt];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += tt * hist[tt];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        t = tt;
      }
    }
  }

  // Downsample: collect ink pixel coordinates at ~200px wide.
  const scale = Math.min(1, 200 / w);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const pts: Array<[number, number]> = [];
  for (let y = 0; y < sh; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < sw; x++) {
      const sx = Math.floor(x / scale);
      if (gray[Math.min(h - 1, sy) * w + Math.min(w - 1, sx)] <= t) {
        pts.push([x, y]);
      }
    }
  }
  if (pts.length < 20) return 0;

  const diag = Math.ceil(Math.hypot(sw, sh));
  let bestTheta = 90;
  let bestScore = -1;
  // Scan the NORMAL angle θ = φ + 90° for line angles φ ∈ [−maxAngle, +maxAngle].
  for (let theta = 90 - maxAngle; theta <= 90 + maxAngle + 1e-9; theta += step) {
    const rad = (theta * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const votes = new Uint32Array(2 * diag + 1);
    for (const [x, y] of pts) {
      const rho = Math.round(x * cos + y * sin) + diag;
      votes[rho]++;
    }
    let score = 0;
    for (let i = 0; i < votes.length; i++) score += votes[i] * votes[i];
    if (score > bestScore) {
      bestScore = score;
      bestTheta = theta;
    }
  }
  // Line angle φ = θ − 90°. Round away floating-point accumulation dust.
  return Math.round((bestTheta - 90) * 100) / 100;
}

/**
 * Rotates a grayscale image by `angleDeg` degrees (positive = clockwise
 * in image coordinates, y down), bilinear interpolation, background 255.
 * Output has the same dimensions as the input; corners may clip.
 */
export function rotateGray(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  angleDeg: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h).fill(255);
  if (angleDeg === 0) return gray.slice();
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Inverse-map destination → source.
      const dx = x - cx;
      const dy = y - cy;
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const top = gray[y0 * w + x0] * (1 - fx) + gray[y0 * w + x1] * fx;
      const bottom = gray[y1 * w + x0] * (1 - fx) + gray[y1 * w + x1] * fx;
      out[y * w + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return out;
}
