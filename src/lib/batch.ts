/**
 * Batch processing queue (pure logic; the OCR runner lives in the batch page).
 *
 * A batch is an ordered list of images. Items are processed strictly in
 * queue order (FIFO) — the browser OCR engine is a single shared resource,
 * so scans serialize even though the 3 lanes each own their items. Results
 * are appended to the gate log in queue order, never out of order.
 */

export type BatchStatus = 'queued' | 'processing' | 'done' | 'failed';

export type BatchItem = {
  id: string;
  name: string;
  /** Object URL or public path for the image. */
  url: string;
  status: BatchStatus;
  /** Lane 1–3 assigned when processing starts, null while queued. */
  lane: number | null;
  plate: string;
  container: string;
  /** OCR confidence, 0–100. */
  confidence: number;
  processingMs: number;
  error: string | null;
  /** True when confidence fell below the review threshold. */
  needsReview: boolean;
  /** Slot-verification outcome once the item was verified. */
  verifyStatus: string | null;
};

let seq = 0;
function nextId(): string {
  seq += 1;
  return `batch-${Date.now().toString(36)}-${seq}`;
}

/**
 * Creates a fresh queue from picked files/samples, all in `queued` status.
 * @param files picked images in the order the user added them.
 * @returns batch items in queue order.
 */
export function createBatchQueue(
  files: { name: string; url: string }[],
): BatchItem[] {
  return files.map((f) => ({
    id: nextId(),
    name: f.name,
    url: f.url,
    status: 'queued',
    lane: null,
    plate: '',
    container: '',
    confidence: 0,
    processingMs: 0,
    error: null,
    needsReview: false,
    verifyStatus: null,
  }));
}

/**
 * Returns the first item still waiting to be processed (FIFO order).
 * @param items batch items.
 * @returns first `queued` item or undefined when the queue is drained.
 */
export function nextQueuedItem(items: BatchItem[]): BatchItem | undefined {
  return items.find((i) => i.status === 'queued');
}

/**
 * Applies a partial update to one item, preserving queue order.
 * @param items batch items.
 * @param id item id.
 * @param patch fields to update.
 * @returns new array with the item updated (unchanged items keep identity).
 */
export function updateBatchItem(
  items: BatchItem[],
  id: string,
  patch: Partial<BatchItem>,
): BatchItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

/**
 * Summary counts for the queue progress bar.
 * @param items batch items.
 * @returns counts + average processing time of finished items.
 */
export function batchSummary(items: BatchItem[]): {
  total: number;
  queued: number;
  processing: number;
  done: number;
  failed: number;
  avgProcessingMs: number;
} {
  const total = items.length;
  const doneItems = items.filter((i) => i.status === 'done');
  const avgProcessingMs =
    doneItems.length > 0
      ? doneItems.reduce((acc, i) => acc + i.processingMs, 0) / doneItems.length
      : 0;
  return {
    total,
    queued: items.filter((i) => i.status === 'queued').length,
    processing: items.filter((i) => i.status === 'processing').length,
    done: doneItems.length,
    failed: items.filter((i) => i.status === 'failed').length,
    avgProcessingMs,
  };
}
