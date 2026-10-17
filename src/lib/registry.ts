/**
 * Mock appointment-slot registry with realistic Casablanca demo data
 * and localStorage persistence.
 *
 * DEMO-ONLY STORAGE — NOT AN OPERATIONAL DATABASE. Slots live in the
 * visitor's own browser localStorage, seeded with hardcoded demo data.
 * There is no server, no sharing between browsers or lanes, no access
 * control, and no audit trail: anyone with devtools can read or rewrite
 * every record. A production deployment must sync the registry from the
 * terminal operating system with server-side logging (see the methodology
 * page, "What production needs"). Nothing in this file is security
 * infrastructure.
 */

import type { Slot } from './slots';
import { LegacySlotSchema } from './contracts';
import { loadValidatedList } from './storage';

export type { Slot };

export const SEED_SLOTS: Slot[] = [
  {
    id: 'slot-1',
    plate: '78452-A-17',
    container: 'MSKU739201-7',
    company: 'Sotransmar',
    line: 'Maersk',
    gate: 1,
    windowStart: '09:00',
    windowEnd: '11:00',
  },
  {
    id: 'slot-2',
    plate: '91208-B-45',
    container: 'FCIU908134-3',
    company: 'Trans Atlas Logistics',
    line: 'MSC',
    gate: 1,
    windowStart: '07:00',
    windowEnd: '09:00',
  },
  {
    id: 'slot-3',
    plate: '33521-C-08',
    container: 'TCLU482913-2',
    company: 'Transports Bennis',
    line: 'CMA CGM',
    gate: 2,
    windowStart: '08:00',
    windowEnd: '10:00',
  },
  {
    id: 'slot-4',
    plate: '55670-D-22',
    container: 'GESU556720-2',
    company: 'STC Maroc',
    line: 'Hapag-Lloyd',
    gate: 3,
    windowStart: '10:00',
    windowEnd: '12:00',
  },
  {
    id: 'slot-5',
    plate: '12345-E-11',
    container: 'BMOU512840-2',
    company: 'Casablanca Freight Lines',
    line: 'Maersk',
    gate: 2,
    windowStart: '06:00',
    windowEnd: '08:00',
  },
  {
    id: 'slot-6',
    plate: '67890-F-33',
    container: 'TGHU390511-3',
    company: 'Maghreb Container Services',
    line: 'MSC',
    gate: 3,
    windowStart: '12:00',
    windowEnd: '14:00',
  },
  {
    id: 'slot-7',
    plate: '24680-G-55',
    container: 'MSKU739201-7',
    company: 'Transports Bennis',
    line: 'CMA CGM',
    gate: 1,
    windowStart: '14:00',
    windowEnd: '16:00',
  },
  {
    id: 'slot-8',
    plate: '13579-H-77',
    container: 'FCIU908134-3',
    company: 'Sotransmar',
    line: 'Hapag-Lloyd',
    gate: 2,
    windowStart: '16:00',
    windowEnd: '18:00',
  },
];

const STORAGE_KEY = 'gatewatch.slots.v1';

/**
 * Loads slots from localStorage, validating every record against the
 * contract on the way in. Corrupted entries are quarantined (visible via
 * the quarantine register + UI banner) instead of trusted or crashing.
 * Falls back to seed data when nothing usable is stored.
 * @returns array of slots.
 */
export function loadSlots(): Slot[] {
  if (typeof window === 'undefined') return SEED_SLOTS;
  const { valid } = loadValidatedList(STORAGE_KEY, LegacySlotSchema, []);
  return valid.length > 0 ? valid : SEED_SLOTS;
}

/**
 * Saves slots to localStorage.
 * @param slots array of slots.
 */
export function saveSlots(slots: Slot[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // ignore storage errors
  }
}

/**
 * Resets slots to seed data and persists.
 * @returns seed slots.
 */
export function resetSlots(): Slot[] {
  saveSlots(SEED_SLOTS);
  return SEED_SLOTS;
}
