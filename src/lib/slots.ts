/**
 * Appointment-slot matching logic (pure, testable).
 */

export type Slot = {
  id: string;
  plate: string;
  container: string;
  company: string;
  line: string;
  gate: 1 | 2 | 3;
  windowStart: string;
  windowEnd: string;
};

export type MatchResult = {
  status: 'match' | 'plate-mismatch' | 'container-mismatch' | 'no-slot' | 'outside-window';
  slot?: Slot;
  detail: string;
};

/** Local normalization helpers (dependency-free). */
function normalizePlate(raw: string): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
}

function normalizeContainer(raw: string): string {
  if (!raw) return "";
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Checks if `now` is within the window [start, end] (inclusive).
 * @param now current date.
 * @param start "HH:MM" 24h.
 * @param end "HH:MM" 24h.
 * @returns true if within window.
 */
export function isWithinWindow(now: Date, start: string, end: string): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (endMin < startMin) {
    // Overnight window, e.g. 22:00–02:00
    return nowMin >= startMin || nowMin <= endMin;
  }
  return nowMin >= startMin && nowMin <= endMin;
}

/**
 * Matches a plate/container pair against a list of slots.
 * @param plate raw plate string.
 * @param container raw container string.
 * @param slots list of slots.
 * @param now current date.
 * @returns match result.
 */
export function matchSlot(
  plate: string,
  container: string,
  slots: Slot[],
  now: Date
): MatchResult {
  const normPlate = normalizePlate(plate);
  const normContainer = normalizeContainer(container);

  // Normalize stored values too — seed/demo data may carry display dashes.
  const slot = slots.find(
    (s) =>
      normalizePlate(s.plate) === normPlate ||
      normalizeContainer(s.container) === normContainer,
  );

  if (!slot) {
    return {
      status: 'no-slot',
      detail: `No appointment found for plate ${normPlate} or container ${normContainer}.`,
    };
  }

  const plateMatches = normalizePlate(slot.plate) === normPlate;
  const containerMatches = normalizeContainer(slot.container) === normContainer;

  if (plateMatches && !containerMatches) {
    return {
      status: 'container-mismatch',
      slot,
      detail: `Plate ${normPlate} matches slot ${slot.id}, but container ${normContainer} does not match ${slot.container}.`,
    };
  }

  if (containerMatches && !plateMatches) {
    return {
      status: 'plate-mismatch',
      slot,
      detail: `Container ${normContainer} matches slot ${slot.id}, but plate ${normPlate} does not match ${slot.plate}.`,
    };
  }

  if (!isWithinWindow(now, slot.windowStart, slot.windowEnd)) {
    return {
      status: 'outside-window',
      slot,
      detail: `Slot ${slot.id} is valid but current time is outside the window ${slot.windowStart}–${slot.windowEnd}.`,
    };
  }

  return {
    status: 'match',
    slot,
    detail: `Match found: plate ${normPlate}, container ${normContainer}, gate ${slot.gate}, window ${slot.windowStart}–${slot.windowEnd}.`,
  };
}
