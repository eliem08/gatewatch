import { describe, it, expect } from 'vitest';
import {
  createLanes,
  assignLane,
  markLaneBusy,
  markLaneIdle,
  laneStats,
  LANE_COUNT,
} from './lanes';

describe('lanes', () => {
  it('creates 3 idle lanes', () => {
    const lanes = createLanes();
    expect(lanes).toHaveLength(LANE_COUNT);
    expect(lanes.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(lanes.every((l) => l.status === 'idle')).toBe(true);
  });

  it('assigns the least-loaded lane, lowest id on ties', () => {
    const lanes = createLanes();
    expect(assignLane(lanes)).toBe(1);
    const busy = markLaneIdle(markLaneBusy(lanes, 1, 'item-1'), 1, 1000);
    expect(assignLane(busy)).toBe(2);
    const busier = markLaneIdle(markLaneBusy(busy, 2, 'item-2'), 2, 1000);
    expect(assignLane(busier)).toBe(3);
  });

  it('balances load round-robin across lanes', () => {
    let lanes = createLanes();
    const picks: number[] = [];
    for (let i = 0; i < 6; i++) {
      const laneId = assignLane(lanes);
      picks.push(laneId);
      lanes = markLaneIdle(markLaneBusy(lanes, laneId, `item-${i}`), laneId, 500);
    }
    expect(picks).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('tracks per-lane processed counts and average time', () => {
    let lanes = createLanes();
    lanes = markLaneIdle(markLaneBusy(lanes, 1, 'a'), 1, 1000);
    lanes = markLaneIdle(markLaneBusy(lanes, 1, 'b'), 1, 3000);
    lanes = markLaneIdle(markLaneBusy(lanes, 2, 'c'), 2, 2000);
    const stats = laneStats(lanes);
    expect(stats[0]).toEqual({ id: 1, status: 'idle', processed: 2, avgProcessingMs: 2000 });
    expect(stats[1]).toEqual({ id: 2, status: 'idle', processed: 1, avgProcessingMs: 2000 });
    expect(stats[2]).toEqual({ id: 3, status: 'idle', processed: 0, avgProcessingMs: 0 });
  });

  it('marks a lane busy with the current item id', () => {
    const lanes = markLaneBusy(createLanes(), 2, 'item-9');
    expect(lanes[1].status).toBe('busy');
    expect(lanes[1].currentItemId).toBe('item-9');
    expect(lanes[0].status).toBe('idle');
  });
});
