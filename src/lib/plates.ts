/**
 * Moroccan truck plate helpers.
 * Demo uses simplified `NNNNN-L-NN` format, e.g. "78452-A-17".
 * Real plates carry Arabic-script region codes.
 */

/**
 * Normalizes a plate string: uppercase, trim, collapse whitespace,
 * replace en/em dashes with "-".
 * @param raw raw input string.
 * @returns normalized string or "" if empty.
 */
export function normalizePlate(raw: string): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
}

export const PLATE_RE = /^[0-9]{4,6}-[A-Z]-[0-9]{1,3}$/;

/**
 * Checks if a normalized plate string is plausible.
 * @param s normalized plate string.
 * @returns true if plausible.
 */
export function isPlausiblePlate(s: string): boolean {
  return PLATE_RE.test(s);
}

/**
 * Extracts plate candidates from OCR text.
 * @param text OCR text.
 * @returns array of normalized plate strings (deduped).
 */
export function extractPlateCandidates(text: string): string[] {
  const re = /[0-9]{4,6}\s*[-–—]\s*[A-Z]\s*[-–—]\s*[0-9]{1,3}/gi;
  const matches = text.match(re) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const normalized = normalizePlate(m);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}
