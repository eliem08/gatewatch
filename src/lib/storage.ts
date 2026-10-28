/**
 * Validated localStorage ingestion boundary.
 *
 * Phase C rule: NOTHING is trusted across the localStorage boundary.
 * Every persisted list (gate-event log, review queue, appointment registry,
 * demo slots) is re-validated against its zod contract ON LOAD. Entries
 * that fail validation go to an explicit quarantine list — surfaced in the
 * UI and the dev log — never dropped silently, never crashing the app.
 *
 * - Malformed JSON payload → the whole payload is quarantined, the caller
 *   gets the fallback (usually seed data) and the app keeps running.
 * - Non-array payload → quarantined as one entry, fallback returned.
 * - Array with bad entries → bad entries quarantined individually, valid
 *   entries kept. Good data is never sacrificed for bad data.
 *
 * Quarantined entries are registered module-wide via
 * `getQuarantineRegister()` so a single UI banner can surface corruption
 * from any key.
 *
 * DEMO-ONLY STORAGE. This boundary validates FORMAT, not integrity:
 * anyone with devtools can still rewrite valid-shaped records. A
 * versioned contract does not make browser storage an operational
 * database.
 */

import { z } from 'zod';

export type QuarantinedEntry = {
  /** Storage key the entry came from. */
  key: string;
  /** Index within the persisted array, or null for whole-payload failures. */
  index: number | null;
  /** Human-readable reason (safe to show in the UI). */
  reason: string;
  /** The raw offending value, for dev inspection. */
  raw: unknown;
};

export type ValidatedLoad<T> = {
  valid: T[];
  quarantined: QuarantinedEntry[];
};

const quarantineRegister: QuarantinedEntry[] = [];

/** Every quarantined entry ever recorded in this session (for the UI banner). */
export function getQuarantineRegister(): QuarantinedEntry[] {
  return [...quarantineRegister];
}

function register(entries: QuarantinedEntry[]): void {
  for (const e of entries) {
    quarantineRegister.push(e);
    if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'test') {
      console.warn(
        `[gatewatch] quarantined invalid record (key=${e.key}, index=${e.index}): ${e.reason}`,
      );
    }
  }
}

/** Dev/test escape hatch: clears the session quarantine register. */
export function clearQuarantineRegister(): void {
  quarantineRegister.length = 0;
}

function summarizeIssue(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return 'failed schema validation';
  const path = first.path.length > 0 ? `${first.path.join('.')}: ` : '';
  return `${path}${first.message}`;
}

/**
 * Loads a persisted JSON array and validates each entry against `schema`.
 *
 * @param key localStorage key.
 * @param schema zod schema for a single entry.
 * @param fallback returned as `valid` when nothing usable is stored.
 * @returns `{ valid, quarantined }` — never throws.
 */
export function loadValidatedList<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T[],
): ValidatedLoad<T> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { valid: fallback, quarantined: [] };
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return { valid: fallback, quarantined: [] };
  }
  if (raw == null) return { valid: fallback, quarantined: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const q: QuarantinedEntry[] = [
      { key, index: null, reason: 'stored payload is not valid JSON', raw },
    ];
    register(q);
    return { valid: fallback, quarantined: q };
  }

  if (!Array.isArray(parsed)) {
    const q: QuarantinedEntry[] = [
      { key, index: null, reason: 'stored payload is not an array', raw: parsed },
    ];
    register(q);
    return { valid: fallback, quarantined: q };
  }

  const valid: T[] = [];
  const quarantined: QuarantinedEntry[] = [];
  parsed.forEach((item, index) => {
    const res = schema.safeParse(item);
    if (res.success) {
      valid.push(res.data);
    } else {
      quarantined.push({
        key,
        index,
        reason: summarizeIssue(res.error),
        raw: item,
      });
    }
  });
  register(quarantined);
  return { valid, quarantined };
}

/**
 * Persists a list that has already been validated by its schema.
 * @param key localStorage key.
 * @param list entries to persist.
 */
export function saveValidatedList<T>(key: string, list: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable — demo continues */
  }
}
