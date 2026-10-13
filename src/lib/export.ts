/**
 * Gate-log CSV export (pure formatting + a browser-only download helper).
 */

import type { GateEntry } from './gatelog';

/** CSV header, in column order. */
export const GATE_LOG_CSV_HEADER = [
  'timestamp',
  'image',
  'plate',
  'container',
  'iso_valid',
  'result',
  'gate',
  'lane',
  'processing_ms',
  'reviewed',
  'corrected',
].join(',');

/**
 * Escapes one CSV cell per RFC 4180: quote when the value contains a comma,
 * quote, or newline; double any embedded quotes.
 * @param value cell value.
 * @returns escaped cell.
 */
export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serializes gate-log entries to CSV (header + one row per entry, in the
 * order given — callers pass newest-first or oldest-first as displayed).
 * @param entries gate-log entries.
 * @returns CSV text.
 */
export function gateLogToCsv(entries: GateEntry[]): string {
  const rows = entries.map((e) =>
    [
      new Date(e.ts).toISOString(),
      e.image,
      e.plate,
      e.container,
      e.isoValid ? 'true' : 'false',
      e.result,
      e.gate != null ? String(e.gate) : '',
      e.lane != null ? String(e.lane) : '',
      String(Math.round(e.processingMs)),
      e.reviewed ? 'true' : 'false',
      e.corrected ? 'true' : 'false',
    ]
      .map(escapeCsvCell)
      .join(','),
  );
  return [GATE_LOG_CSV_HEADER, ...rows].join('\n');
}

/**
 * Triggers a browser download of CSV text. No-op on the server.
 * @param filename download filename, e.g. "gate-log-2026-10-13.csv".
 * @param csv CSV text.
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
