import { describe, it, expect } from 'vitest';
import { escapeCsvCell, gateLogToCsv, GATE_LOG_CSV_HEADER } from './export';
import type { GateEntry } from './gatelog';

const mk = (over: Partial<GateEntry>): GateEntry => ({
  id: 'e1',
  ts: new Date('2026-10-13T08:15:30.000Z').getTime(),
  image: 'truck.jpg',
  plate: '78452-A-17',
  container: 'MSKU7392017',
  isoValid: true,
  result: 'match',
  gate: 1,
  processingMs: 12345,
  ...over,
});

describe('CSV export', () => {
  it('escapes cells containing commas, quotes, or newlines', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('writes the header and one row per entry', () => {
    const csv = gateLogToCsv([mk({}), mk({ id: 'e2', plate: 'WW-123456', result: 'no-slot' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(GATE_LOG_CSV_HEADER);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('2026-10-13T08:15:30.000Z');
    expect(lines[1]).toContain('78452-A-17');
    expect(lines[1]).toContain('match');
    expect(lines[2]).toContain('WW-123456');
    expect(lines[2]).toContain('no-slot');
  });

  it('emits empty strings for missing gate/lane and false for review flags', () => {
    const csv = gateLogToCsv([mk({ gate: undefined, lane: undefined })]);
    const row = csv.split('\n')[1];
    const cells = row.split(',');
    // columns: timestamp,image,plate,container,iso_valid,result,gate,lane,processing_ms,reviewed,corrected
    expect(cells[6]).toBe('');
    expect(cells[7]).toBe('');
    expect(cells[9]).toBe('false');
    expect(cells[10]).toBe('false');
  });

  it('quotes image names containing commas', () => {
    const csv = gateLogToCsv([mk({ image: 'truck, front.jpg' })]);
    expect(csv.split('\n')[1]).toContain('"truck, front.jpg"');
  });

  it('returns just the header for an empty log', () => {
    expect(gateLogToCsv([])).toBe(GATE_LOG_CSV_HEADER);
  });
});
