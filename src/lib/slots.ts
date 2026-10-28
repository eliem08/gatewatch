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
  status:
    | 'match'
    | 'plate-mismatch'
    | 'container-mismatch'
    | 'no-slot'
    | 'outside-window'
    | 'ambiguous';
  slot?: Slot;
  /**
   * Set when status === 'ambiguous': the registry records that conflict
   * (duplicate or cross-matching records). The operator resolves these
   * against the terminal operating system — the demo never guesses.
   */
  candidates?: Slot[];
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
 *
 * Resolution order (every multi-record case lands in an explicit review
 * path — never a guess):
 * 1. Exact two-field match (plate AND container) wins outright, even when
 *    other records share one of the keys. The window check then applies.
 * 2. Duplicate full records (two slots with the same plate+container) →
 *    'ambiguous'.
 * 3. No key hits at all → 'no-slot'.
 * 4. Plate and container point at DIFFERENT slots, or one key hits several
 *    slots → 'ambiguous' with the conflicting candidates listed.
 * 5. Exactly one slot hit on one key only → plate/container-mismatch.
 *
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

  const plateHits = slots.filter((s) => normalizePlate(s.plate) === normPlate);
  const containerHits = slots.filter(
    (s) => normalizeContainer(s.container) === normContainer,
  );
  const bothHits = slots.filter(
    (s) =>
      normalizePlate(s.plate) === normPlate &&
      normalizeContainer(s.container) === normContainer,
  );

  if (bothHits.length > 1) {
    const ids = bothHits.map((s) => s.id).join(', ');
    return {
      status: 'ambiguous',
      candidates: bothHits,
      detail: `Duplicate records: slots ${ids} all claim plate ${normPlate} + container ${normContainer}. Operator must resolve against the terminal operating system.`,
    };
  }

  if (bothHits.length === 1) {
    const slot = bothHits[0];
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

  if (plateHits.length === 0 && containerHits.length === 0) {
    return {
      status: 'no-slot',
      detail: `No appointment found for plate ${normPlate} or container ${normContainer}.`,
    };
  }

  // From here the keys disagree: the plate and the container name different
  // slots (or one key names several). Never guess — escalate to a human.
  if (plateHits.length > 0 && containerHits.length > 0) {
    const plateIds = plateHits.map((s) => s.id).join(', ');
    const contIds = containerHits.map((s) => s.id).join(', ');
    return {
      status: 'ambiguous',
      candidates: [...plateHits, ...containerHits],
      detail: `Conflicting records: plate ${normPlate} points to slot(s) ${plateIds}, container ${normContainer} points to slot(s) ${contIds}. Operator must resolve against the terminal operating system.`,
    };
  }

  if (plateHits.length > 1) {
    const ids = plateHits.map((s) => s.id).join(', ');
    return {
      status: 'ambiguous',
      candidates: plateHits,
      detail: `Duplicate records: plate ${normPlate} is claimed by slots ${ids}. Operator must resolve against the terminal operating system.`,
    };
  }

  if (containerHits.length > 1) {
    const ids = containerHits.map((s) => s.id).join(', ');
    return {
      status: 'ambiguous',
      candidates: containerHits,
      detail: `Duplicate records: container ${normContainer} is claimed by slots ${ids}. Operator must resolve against the terminal operating system.`,
    };
  }

  if (plateHits.length === 1) {
    const slot = plateHits[0];
    return {
      status: 'container-mismatch',
      slot,
      detail: `Plate ${normPlate} matches slot ${slot.id}, but container ${normContainer} does not match ${slot.container}.`,
    };
  }

  const slot = containerHits[0];
  return {
    status: 'plate-mismatch',
    slot,
    detail: `Container ${normContainer} matches slot ${slot.id}, but plate ${normPlate} does not match ${slot.plate}.`,
  };
}
