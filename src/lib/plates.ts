/**
 * Moroccan truck plate helpers.
 *
 * Supported formats (all normalized to dash-separated, uppercase):
 * - Current series: `NNNNN-L-NN`, e.g. "78452-A-17" (4–6 digits, 1–2 letter
 *   series, 1–3 digit suffix). The series letter ran A–Z, then AA, AB, …
 *   once single letters were exhausted.
 * - Region suffix (optional): `NNNNN-L-NN-XXX`, e.g. "78452-A-17-CAS".
 *   Real Moroccan plates carry the region code in Arabic script; OCR with an
 *   English model cannot read Arabic script, so the demo accepts the Latin
 *   transliteration variants used on export/transit paperwork for the major
 *   registration cities (CAS = Casablanca, RAB = Rabat, FES = Fès, …).
 * - Temporary plates: `WW-NNNNNN` or `NNNNNN-WW` (WW = "wagon / waiting",
 *   the temporary registration series for vehicles awaiting full plates).
 */

/**
 * Latin transliteration codes for Moroccan registration cities, used as the
 * optional region suffix on plates. Only these codes are accepted as a
 * suffix — any other trailing word is treated as OCR noise, not a region.
 */
export const REGION_CODES = [
  'CAS', // Casablanca
  'RAB', // Rabat
  'FES', // Fès
  'MAR', // Marrakech
  'TAN', // Tangier
  'AGD', // Agadir
  'MEK', // Meknès
  'OUJ', // Oujda
  'KEN', // Kénitra
  'SAF', // Safi
  'SET', // Settat
  'ELJ', // El Jadida
  'BER', // Berrechid
  'NDR', // Nador
  'ERR', // Errachidia
  'LAA', // Laâyoune
  'DAK', // Dakhla
  'TAR', // Taroudant
  'TIZ', // Tiznit
  'ZAG', // Zagora
  'BEN', // Beni Mellal
  'KHG', // Khouribga
  'MDI', // Mohammedia
  'ALH', // Al Hoceima
  'CHC', // Chefchaouen
  'SIF', // Sidi Ifni
  'JDI', // Sidi Kacem / region code used on transit paperwork
  'TET', // Tétouan
  'LAR', // Larache
  'TAZ', // Taza
  'IFR', // Ifrane
  'KHE', // Khémisset
  'BEM', // Béni Mellal region variant seen on some plates
  'OUA', // Ouarzazate
  'TNG', // Tangier variant
  'GUE', // Guelmim
  'SMR', // Smara
  'BOJ', // Boujdour
] as const;

const REGION_ALT = REGION_CODES.join('|');

/**
 * Normalizes a plate string: uppercase, trim, collapse whitespace,
 * replace en/em dashes with "-", and canonicalize WW temporary plates
 * (`WW123456` → `WW-123456`, `123456WW` → `123456-WW`).
 * @param raw raw input string.
 * @returns normalized string or "" if empty.
 */
export function normalizePlate(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-');
  const wwPrefix = cleaned.match(/^WW(\d{6})$/);
  if (wwPrefix) return `WW-${wwPrefix[1]}`;
  const wwSuffix = cleaned.match(/^(\d{6})WW$/);
  if (wwSuffix) return `${wwSuffix[1]}-WW`;
  return cleaned;
}

/** Plausible plate shapes (union of all supported formats). */
export const PLATE_RE = new RegExp(
  `^(?:[0-9]{4,6}-[A-Z]{1,2}-[0-9]{1,3}(?:-(?:${REGION_ALT}))?|WW-[0-9]{6}|[0-9]{6}-WW)$`,
);

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
 * Matches the standard series (with optional validated region suffix) and
 * both WW temporary-plate shapes. Results are normalized and deduped.
 * @param text OCR text.
 * @returns array of normalized plate strings (deduped).
 */
export function extractPlateCandidates(text: string): string[] {
  const patterns: RegExp[] = [
    // Standard series with optional region suffix (only known codes count).
    new RegExp(
      `[0-9]{4,6}\\s*[-–—]\\s*[A-Z]{1,2}\\s*[-–—]\\s*[0-9]{1,3}(?:\\s*[-–—]\\s*(?:${REGION_ALT}))?`,
      'gi',
    ),
    // Temporary plates, WW first or last.
    /WW\s*[-–—]?\s*[0-9]{6}/gi,
    /[0-9]{6}\s*[-–—]?\s*WW/gi,
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const re of patterns) {
    const matches = text.match(re) ?? [];
    for (const m of matches) {
      const normalized = normalizePlate(m);
      if (normalized && isPlausiblePlate(normalized) && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
  }
  return result;
}
