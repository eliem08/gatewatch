/**
 * Confusion log: every human correction in the review queue is aligned
 * (OCR read vs. operator's correction) and its character substitutions
 * are recorded. Aggregating the log answers the professor's question:
 * *which* characters does the system confuse, and does preprocessing
 * change the answer?
 *
 * Storage: a JSON array in localStorage under CONFUSION_KEY. The pure
 * aggregation functions take records as input so they stay testable.
 */
import { confusionTable } from './metrics';

export type ConfusionRecord = {
  id: string;
  ts: number;
  /** 'plate' | 'container' — which field was corrected. */
  field: 'plate' | 'container';
  /** What OCR produced. */
  ocr: string;
  /** What the operator corrected it to. */
  corrected: string;
  /**
   * Whether preprocessing was enabled for the scan that produced the
   * OCR read. 'unknown' for legacy records / scans that did not report it.
   */
  preprocessing: 'on' | 'off' | 'unknown';
  /** Image-quality bucket as reported at scan time. */
  quality: string;
};

export const CONFUSION_KEY = 'gatewatch.confusion.v1';

let seq = 0;
function nextId(): string {
  seq += 1;
  return `conf-${Date.now().toString(36)}-${seq}`;
}

/**
 * Builds confusion records for one corrected review item: one record per
 * field that actually changed (plate and/or container).
 */
export function correctionToRecords(args: {
  ocrPlate: string;
  correctedPlate: string;
  ocrContainer: string;
  correctedContainer: string;
  preprocessing: 'on' | 'off' | 'unknown';
  quality: string;
  ts?: number;
}): ConfusionRecord[] {
  const ts = args.ts ?? Date.now();
  const records: ConfusionRecord[] = [];
  if (args.correctedPlate !== args.ocrPlate) {
    records.push({
      id: nextId(),
      ts,
      field: 'plate',
      ocr: args.ocrPlate,
      corrected: args.correctedPlate,
      preprocessing: args.preprocessing,
      quality: args.quality,
    });
  }
  if (args.correctedContainer !== args.ocrContainer) {
    records.push({
      id: nextId(),
      ts,
      field: 'container',
      ocr: args.ocrContainer,
      corrected: args.correctedContainer,
      preprocessing: args.preprocessing,
      quality: args.quality,
    });
  }
  return records;
}

export type ConfusionAggregate = {
  totalCorrections: number;
  totalSubstitutions: number;
  /** Most-confused character pairs across all records. */
  topPairs: Array<{ from: string; to: string; count: number }>;
  /** Confusion pairs split by preprocessing on/off. */
  byPreprocessing: {
    on: Array<{ from: string; to: string; count: number }>;
    off: Array<{ from: string; to: string; count: number }>;
  };
  /** Corrections per quality bucket. */
  byQuality: Array<{ quality: string; count: number }>;
  /** Corrections per field. */
  byField: { plate: number; container: number };
};

/** Aggregates confusion records into the error-analysis dashboard view. */
export function aggregateConfusion(records: ConfusionRecord[]): ConfusionAggregate {
  const pairs = records.map((r) => ({ reference: r.corrected, hypothesis: r.ocr }));
  const topPairs = confusionTable(pairs);
  const totalSubstitutions = topPairs.reduce((acc, p) => acc + p.count, 0);

  const onPairs = records
    .filter((r) => r.preprocessing === 'on')
    .map((r) => ({ reference: r.corrected, hypothesis: r.ocr }));
  const offPairs = records
    .filter((r) => r.preprocessing === 'off')
    .map((r) => ({ reference: r.corrected, hypothesis: r.ocr }));

  const byQualityMap = new Map<string, number>();
  let plate = 0;
  let container = 0;
  for (const r of records) {
    byQualityMap.set(r.quality, (byQualityMap.get(r.quality) ?? 0) + 1);
    if (r.field === 'plate') plate++;
    else container++;
  }

  return {
    totalCorrections: records.length,
    totalSubstitutions,
    topPairs,
    byPreprocessing: {
      on: confusionTable(onPairs),
      off: confusionTable(offPairs),
    },
    byQuality: [...byQualityMap.entries()]
      .map(([quality, count]) => ({ quality, count }))
      .sort((a, b) => b.count - a.count),
    byField: { plate, container },
  };
}

/** Loads the persisted confusion log (empty array when absent/corrupt). */
export function loadConfusionLog(): ConfusionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONFUSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ConfusionRecord[];
    return [];
  } catch {
    return [];
  }
}

/** Appends records to the persisted confusion log. */
export function appendConfusionLog(records: ConfusionRecord[]): void {
  if (typeof window === 'undefined' || records.length === 0) return;
  try {
    const existing = loadConfusionLog();
    window.localStorage.setItem(
      CONFUSION_KEY,
      JSON.stringify([...existing, ...records]),
    );
  } catch {
    /* storage unavailable — analysis degrades to in-memory only */
  }
}

/** Clears the persisted confusion log. */
export function clearConfusionLog(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CONFUSION_KEY);
  } catch {
    /* ignore */
  }
}
