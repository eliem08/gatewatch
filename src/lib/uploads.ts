/**
 * Upload validation for gate images (pure, testable).
 *
 * Both dropzones (single demo upload + batch queue) route every picked
 * file through `validateUploadFile` BEFORE creating an object URL for it.
 * Rejected files never enter the scan pipeline: the caller shows
 * `reason` to the user and drops the file.
 *
 * Why these limits:
 * - Size: a corrupt or absurdly large file (e.g. a multi-hundred-MB "photo")
 *   can stall image decode or exhaust tab memory during canvas
 *   preprocessing. 15 MB is far above any real gate capture at the 1600px
 *   working size the OCR pipeline downscales to.
 * - Type: the MIME allowlist is checked first because the pipeline only
 *   decodes raster/vector images. A wrong MIME type is rejected even if
 *   the extension looks right; a zero-byte file is rejected outright.
 *
 * NOTE: MIME types are browser-supplied and can be spoofed. The second
 * line of defence is decode-time: `loadImage` rejects files the browser
 * cannot decode, and both pages handle that rejection (demo: error panel
 * with retry; batch: item marked `failed`). A file that passes validation
 * but fails to decode never reaches the OCR engine.
 */

/** Hard cap on a single uploaded image (15 MiB). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** MIME types the decode path is known to handle. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'image/bmp',
] as const;

export type UploadValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validates one picked file. Accepts anything with the File shape
 * (`name`, `type`, `size`) so it is unit-testable without a browser.
 *
 * @param file picked file (or File-like object).
 * @returns `{ ok: true }`, or `{ ok: false, reason }` with a
 *   human-readable rejection message.
 */
export function validateUploadFile(file: {
  name: string;
  type: string;
  size: number;
}): UploadValidation {
  if (!file || typeof file.size !== 'number' || typeof file.type !== 'string') {
    return { ok: false, reason: 'That file could not be read. Try picking it again.' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, reason: `"${file.name || 'file'}" is empty (0 bytes) — nothing to scan.` };
  }
  if (!file.type || !(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      reason: `"${file.name || 'file'}" is not a supported image type. Use JPG, PNG, WebP or SVG.`,
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `"${file.name || 'file'}" is ${mb} MB — over the 15 MB limit. Use a smaller photo.`,
    };
  }
  return { ok: true };
}
