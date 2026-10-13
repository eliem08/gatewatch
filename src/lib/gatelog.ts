/**
 * Gate crossing log + statistics (pure functions; storage handled by callers).
 */

import type { MatchResult } from './slots';

export type GateEntry = {
  id: string;
  ts: number;
  image: string;
  plate: string;
  container: string;
  isoValid: boolean;
  result: MatchResult['status'];
  gate?: number;
  processingMs: number;
  /** Batch lane (1–3) that scanned this crossing, when it came from batch mode. */
  lane?: number | null;
  /** True when the read passed through the human review queue. */
  reviewed?: boolean;
  /** True when the operator corrected at least one field in review. */
  corrected?: boolean;
};

/**
 * Computes aggregate statistics for gate entries.
 * @param entries list of gate entries.
 * @returns stats object.
 */
export function computeStats(entries: GateEntry[]): {
  total: number;
  trucksPerHour: number;
  avgProcessingMs: number;
  mismatchRate: number;
  matches: number;
  mismatches: number;
} {
  const total = entries.length;
  if (total === 0) {
    return {
      total: 0,
      trucksPerHour: 0,
      avgProcessingMs: 0,
      mismatchRate: 0,
      matches: 0,
      mismatches: 0,
    };
  }

  const matches = entries.filter((e) => e.result === 'match').length;
  const mismatches = total - matches;

  const sumProcessing = entries.reduce((acc, e) => acc + e.processingMs, 0);
  const avgProcessingMs = sumProcessing / total;

  const timestamps = entries.map((e) => e.ts);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const hoursSpanned = (maxTs - minTs) / 3_600_000;
  const effectiveHours = Math.max(hoursSpanned, 1 / 60);
  const trucksPerHour = total / effectiveHours;

  const mismatchRate = mismatches / total;

  return {
    total,
    trucksPerHour,
    avgProcessingMs,
    mismatchRate,
    matches,
    mismatches,
  };
}

/**
 * Buckets entries by hour label "HH:00", sorted.
 * @param entries list of gate entries.
 * @returns array of { hour, count }.
 */
export function bucketByHour(entries: GateEntry[]): { hour: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.ts);
    const hour = `${String(d.getHours()).padStart(2, '0')}:00`;
    map.set(hour, (map.get(hour) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

/**
 * Generates a short unique id.
 * @returns unique id string.
 */
export function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
