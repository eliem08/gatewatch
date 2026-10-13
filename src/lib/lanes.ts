/**
 * Gate lane model (pure logic).
 *
 * Casablanca's terminal has 3 gates. Each batch item is assigned to a lane
 * when processing starts — the least-loaded lane wins (ties go to the
 * lowest lane number) — and the lane tracks its own throughput. Lanes share
 * the single browser OCR engine, so scans serialize in queue order; the
 * lane assignment still mirrors production, where each lane owns a camera
 * and a reader.
 */

export const LANE_COUNT = 3;

export type LaneStatus = 'idle' | 'busy';

export type Lane = {
  id: number;
  status: LaneStatus;
  currentItemId: string | null;
  /** Completed items handled by this lane. */
  processed: number;
  /** Cumulative processing time of completed items, ms. */
  totalMs: number;
};

/** Creates the 3 lanes, all idle. */
export function createLanes(): Lane[] {
  return Array.from({ length: LANE_COUNT }, (_, i) => ({
    id: i + 1,
    status: 'idle' as LaneStatus,
    currentItemId: null,
    processed: 0,
    totalMs: 0,
  }));
}

/**
 * Picks the lane for the next item: fewest completed items, lowest id on ties.
 * @param lanes current lanes.
 * @returns lane id (1–3).
 */
export function assignLane(lanes: Lane[]): number {
  let best = lanes[0];
  for (const lane of lanes) {
    if (lane.processed < best.processed) best = lane;
  }
  return best.id;
}

/**
 * Marks a lane busy on the given item.
 * @param lanes current lanes.
 * @param laneId lane id.
 * @param itemId batch item id now being scanned.
 * @returns new lanes array.
 */
export function markLaneBusy(lanes: Lane[], laneId: number, itemId: string): Lane[] {
  return lanes.map((l) =>
    l.id === laneId ? { ...l, status: 'busy' as LaneStatus, currentItemId: itemId } : l,
  );
}

/**
 * Marks a lane idle again after an item finishes, banking its time.
 * @param lanes current lanes.
 * @param laneId lane id.
 * @param processingMs scan time of the finished item.
 * @returns new lanes array.
 */
export function markLaneIdle(lanes: Lane[], laneId: number, processingMs: number): Lane[] {
  return lanes.map((l) =>
    l.id === laneId
      ? {
          ...l,
          status: 'idle' as LaneStatus,
          currentItemId: null,
          processed: l.processed + 1,
          totalMs: l.totalMs + processingMs,
        }
      : l,
  );
}

/**
 * Per-lane throughput stats for the dashboard.
 * @param lanes current lanes.
 * @returns one row per lane with average scan time.
 */
export function laneStats(lanes: Lane[]): {
  id: number;
  status: LaneStatus;
  processed: number;
  avgProcessingMs: number;
}[] {
  return lanes.map((l) => ({
    id: l.id,
    status: l.status,
    processed: l.processed,
    avgProcessingMs: l.processed > 0 ? l.totalMs / l.processed : 0,
  }));
}
