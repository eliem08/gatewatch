/**
 * Browser-only OCR engine wrapper around tesseract.js v5.
 *
 * IMPORTANT: client-only. Never import this at the top level of a server
 * component or route handler — tesseract.js touches `window`/`document` while
 * bootstrapping its worker. The dynamic `import()` below keeps the engine out
 * of the initial bundle and out of the server graph.
 */

import { runPipeline, DEFAULT_OPTIONS, type PreprocessOptions } from './preprocess';
import {
  histogramEqualize,
  clahe,
  medianDenoise,
  adaptiveThreshold,
  estimateSkewAngle,
  rotateGray,
} from './advancedPreprocess';
import { otsuThreshold, applyThreshold, upscaleGray } from './preprocess';
import { combineEngineReads, ENSEMBLE_PSMS, type EngineRead, type EnsembleResult } from './ensemble';

export type OcrProgress = { status: string; progress: number };

export type OcrResult = { text: string; confidence: number; ms: number };

export type PreprocessToggles = {
  contrast: boolean;
  threshold: boolean;
  upscale: boolean;
};

/** Full preprocessing options for the timed pipeline (demo page). */
export type AdvancedPreprocessToggles = {
  denoise: boolean;
  equalize: 'none' | 'he' | 'clahe';
  deskew: boolean;
  contrast: boolean;
  threshold: 'none' | 'otsu' | 'adaptive';
  upscale: boolean;
};

export const DEFAULT_ADVANCED_TOGGLES: AdvancedPreprocessToggles = {
  denoise: false,
  equalize: 'none',
  deskew: false,
  contrast: true,
  threshold: 'none',
  upscale: true,
};

export type PipelineStepTiming = { step: string; ms: number };

export type TimedPreprocessResult = {
  dataUrl: string;
  width: number;
  height: number;
  timings: PipelineStepTiming[];
  /** Hough-estimated skew angle in degrees, or null when deskew was off. */
  skewAngle: number | null;
  /** Otsu threshold used, or null when Otsu was not the threshold step. */
  thresholdUsed: number | null;
};

const ENGINE_LOAD_ERROR =
  'OCR engine failed to load — check your network connection and retry.';

const MAX_DIMENSION = 1600;

type TesseractWorker = {
  recognize: (image: string) => Promise<{ data: { text?: string; confidence?: number } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker> | null = null;
let activeLogger: ((p: OcrProgress) => void) | null = null;

function getWorker(onProgress?: (p: OcrProgress) => void): Promise<TesseractWorker> {
  activeLogger = onProgress ?? null;

  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const mod: any = await import('tesseract.js');
        const createWorker = mod?.createWorker ?? mod?.default?.createWorker;
        if (typeof createWorker !== 'function') {
          throw new Error('createWorker is not exported by tesseract.js');
        }

        const worker = (await createWorker('eng', 1, {
          // Canonical tessdata host; the default jsDelivr mirror is blocked
          // in some corporate/proxied networks.
          langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
          logger: (m: any) => {
            if (!activeLogger) return;
            const raw = Number(m?.progress);
            activeLogger({
              status: String(m?.status ?? ''),
              progress: Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0,
            });
          },
        })) as TesseractWorker;

        await worker.setParameters({ tessedit_pageseg_mode: '6' });
        return worker;
      } catch {
        workerPromise = null;
        throw new Error(ENGINE_LOAD_ERROR);
      }
    })();
  }

  return workerPromise;
}

export type PsmMode = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13';

/**
 * Run OCR over an image source (data URL, blob URL, object URL or path).
 * The worker is a module-level singleton and is intentionally NOT terminated
 * after each call — use `terminateOcr()` to dispose it.
 */
export async function recognizeImage(
  source: string,
  onProgress?: (p: OcrProgress) => void,
  psm: PsmMode = '11',
): Promise<OcrResult> {
  const started = performance.now();
  const worker = await getWorker(onProgress);
  // Page segmentation is per-pass: sparse text (11) for full gate frames,
  // fully automatic (3) for tight region crops like the plate band.
  await worker.setParameters({ tessedit_pageseg_mode: psm });

  try {
    const { data } = await worker.recognize(source);
    const confidence = Number(data?.confidence);
    return {
      text: typeof data?.text === 'string' ? data.text : '',
      confidence: Number.isFinite(confidence) ? confidence : 0,
      ms: performance.now() - started,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'OCR failed to read this image. Try a sharper photo or a different sample.';
    throw new Error(message);
  }
}

/** Dispose the singleton worker. Safe to call when nothing was ever created. */
export async function terminateOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  activeLogger = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* worker never came up — nothing to dispose */
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode that image.'));
    img.src = src;
  });
}

/**
 * Canvas preprocessing pipeline: downscale to a sane working size, run the
 * pure pixel pipeline from `./preprocess`, and hand back a PNG data URL that
 * can be fed straight into tesseract.
 */
export async function preprocessToDataUrl(
  img: HTMLImageElement,
  opts: PreprocessToggles,
): Promise<{ dataUrl: string; width: number; height: number }> {
  let source = img;
  if (!source.complete || source.naturalWidth === 0) {
    source = await loadImageElement(source.src);
  }

  const naturalW = source.naturalWidth || source.width || 1;
  const naturalH = source.naturalHeight || source.height || 1;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.drawImage(source, 0, 0, width, height);

  const input = ctx.getImageData(0, 0, width, height);

  const options: PreprocessOptions = {
    ...DEFAULT_OPTIONS,
    contrast: opts.contrast,
    threshold: opts.threshold ? 'otsu' : 'none',
    upscale: opts.upscale,
  };

  // runPipeline works on raw grayscale bytes; feed it the RGBA buffer's data.
  const piped = runPipeline(input.data, width, height, options);

  // Expand single-channel grayscale back to RGBA for canvas display.
  const px = piped.w * piped.h;
  const rgba = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    const v = piped.data[i] ?? 0;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  const output = new ImageData(rgba, piped.w, piped.h);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = output.width;
  outCanvas.height = output.height;

  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Canvas 2D is unavailable in this browser.');
  outCtx.putImageData(output, 0, 0);

  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    width: output.width,
    height: output.height,
  };
}

/**
 * Timed preprocessing pipeline: same canvas I/O as `preprocessToDataUrl`
 * but each step runs separately with per-step timing, and the advanced
 * steps (denoise, equalize, deskew, adaptive threshold) are available.
 * Step order follows standard CV practice: denoise first (so later
 * contrast steps do not amplify noise), equalize, deskew, contrast,
 * threshold, upscale.
 */
export async function preprocessToDataUrlTimed(
  img: HTMLImageElement,
  opts: AdvancedPreprocessToggles,
): Promise<TimedPreprocessResult> {
  let source = img;
  if (!source.complete || source.naturalWidth === 0) {
    source = await loadImageElement(source.src);
  }
  const naturalW = source.naturalWidth || source.width || 1;
  const naturalH = source.naturalHeight || source.height || 1;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.drawImage(source, 0, 0, width, height);
  const input = ctx.getImageData(0, 0, width, height);

  const timings: PipelineStepTiming[] = [];
  const timed = <T>(step: string, fn: () => T): T => {
    const t0 = performance.now();
    const out = fn();
    timings.push({ step, ms: Math.round((performance.now() - t0) * 100) / 100 });
    return out;
  };

  // Step 1: RGBA → grayscale (luminance).
  let current: Uint8ClampedArray = timed('grayscale', () => {
    const len = input.data.length / 4;
    const gray = new Uint8ClampedArray(len);
    for (let i = 0; i < len; i++) {
      gray[i] = Math.round(
        0.299 * input.data[i * 4] + 0.587 * input.data[i * 4 + 1] + 0.114 * input.data[i * 4 + 2],
      );
    }
    return gray;
  });
  let w = width;
  let h = height;
  let skewAngle: number | null = null;
  let thresholdUsed: number | null = null;

  if (opts.denoise) {
    current = timed('denoise (3×3 median)', () => medianDenoise(current, w, h));
  }
  if (opts.equalize === 'he') {
    current = timed('equalize (histogram)', () => histogramEqualize(current));
  } else if (opts.equalize === 'clahe') {
    current = timed('equalize (CLAHE)', () => clahe(current, w, h));
  }
  if (opts.deskew) {
    const angle = timed('deskew (Hough estimate)', () => estimateSkewAngle(current, w, h));
    skewAngle = angle;
    if (Math.abs(angle) >= 0.5) {
      current = timed('deskew (rotate)', () => rotateGray(current, w, h, -angle));
    }
  }
  if (opts.contrast) {
    current = timed('contrast stretch', () => {
      // Reuse the percentile stretch from the base pipeline.
      const total = w * h;
      const hist = new Uint32Array(256);
      for (let i = 0; i < total; i++) hist[current[i]]++;
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
      if (range <= 0) return current.slice();
      const out = new Uint8ClampedArray(total);
      for (let i = 0; i < total; i++) out[i] = Math.round(((current[i] - low) / range) * 255);
      return out;
    });
  }
  if (opts.threshold === 'otsu') {
    const t = timed('threshold (Otsu)', () => otsuThreshold(current));
    thresholdUsed = t;
    current = timed('threshold (apply)', () => applyThreshold(current, t));
  } else if (opts.threshold === 'adaptive') {
    current = timed('threshold (adaptive)', () => adaptiveThreshold(current, w, h));
  }
  if (opts.upscale) {
    const up = timed('upscale 2×', () => upscaleGray(current, w, h, 2));
    current = up.data;
    w = up.w;
    h = up.h;
  }

  const dataUrl = grayArrayToDataUrl(current, w, h);
  return { dataUrl, width: w, height: h, timings, skewAngle, thresholdUsed };
}

/** Encodes a single-channel grayscale array as a PNG data URL (client-only). */
export function grayArrayToDataUrl(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
): string {
  const px = w * h;
  const rgba = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    const v = gray[i] ?? 0;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Ensemble OCR: runs Tesseract once per PSM mode in ENSEMBLE_PSMS
 * (sequentially — the worker is a singleton) and combines the reads by
 * confidence-weighted field voting. Returns the voted result plus the
 * per-engine reads for the agreement panel (callers may append extra
 * reads, e.g. a crop fallback, and re-run `combineEngineReads`).
 */
export async function recognizeEnsemble(
  source: string,
  onProgress?: (p: OcrProgress & { engine: string }) => void,
): Promise<{ ensemble: EnsembleResult; reads: EngineRead[]; totalMs: number }> {
  const started = performance.now();
  const reads: EngineRead[] = [];
  for (const psm of ENSEMBLE_PSMS) {
    onProgress?.({ status: `OCR pass PSM ${psm}`, progress: reads.length / ENSEMBLE_PSMS.length, engine: `PSM ${psm}` });
    const res = await recognizeImage(source, (p) => {
      onProgress?.({
        status: `PSM ${psm}: ${p.status}`,
        progress: (reads.length + p.progress) / ENSEMBLE_PSMS.length,
        engine: `PSM ${psm}`,
      });
    }, psm as PsmMode);
    reads.push({ psm, text: res.text, confidence: res.confidence, ms: res.ms });
  }
  onProgress?.({ status: 'Voting', progress: 1, engine: 'ensemble' });
  return { ensemble: combineEngineReads(reads), reads, totalMs: performance.now() - started };
}

/**
 * Crop a vertical band of an image to a PNG data URL (client-only).
 * Used for the second OCR pass: plates sit low in gate-camera frames and
 * full-page layout analysis often skips them, so we re-scan the lower
 * region on its own — the same trick real ANPR pipelines use with a
 * dedicated plate camera.
 */
export function cropToDataUrl(
  img: HTMLImageElement,
  topFrac: number,
  heightFrac: number,
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const sy = Math.round(h * topFrac);
  const sh = Math.round(h * heightFrac);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.drawImage(img, 0, sy, w, sh, 0, 0, w, sh);
  return canvas.toDataURL('image/png');
}
