import { describe, it, expect } from 'vitest';
import { matchSlot, isWithinWindow, type Slot } from './slots';

const slots: Slot[] = [
  {
    id: 's1',
    plate: '78452-A-17',
    container: 'MSKU7392017',
    company: 'Sotransmar',
    line: 'Maersk',
    gate: 1,
    windowStart: '09:00',
    windowEnd: '11:00',
  },
];

const now = new Date('2026-10-12T10:00:00');

describe('slots', () => {
  it('matches plate and container within window', () => {
    const result = matchSlot('78452-A-17', 'MSKU7392017', slots, now);
    expect(result.status).toBe('match');
    expect(result.slot?.id).toBe('s1');
  });

  it('detects container mismatch', () => {
    const result = matchSlot('78452-A-17', 'GESU5567202', slots, now);
    expect(result.status).toBe('container-mismatch');
  });

  it('detects plate mismatch', () => {
    const result = matchSlot('00000-Z-00', 'MSKU7392017', slots, now);
    expect(result.status).toBe('plate-mismatch');
  });

  it('returns no-slot for unknown plate and container', () => {
    const result = matchSlot('00000-Z-00', 'GESU5567202', slots, now);
    expect(result.status).toBe('no-slot');
  });

  it('detects outside window', () => {
    const late = new Date('2026-10-12T12:30:00');
    const result = matchSlot('78452-A-17', 'MSKU7392017', slots, late);
    expect(result.status).toBe('outside-window');
  });

  it('checks within window', () => {
    expect(isWithinWindow(new Date('2026-10-12T10:00:00'), '09:00', '11:00')).toBe(true);
    expect(isWithinWindow(new Date('2026-10-12T08:59:00'), '09:00', '11:00')).toBe(false);
    expect(isWithinWindow(new Date('2026-10-12T11:01:00'), '09:00', '11:00')).toBe(false);
    expect(isWithinWindow(new Date('2026-10-12T23:00:00'), '22:00', '02:00')).toBe(true);
    expect(isWithinWindow(new Date('2026-10-12T03:00:00'), '22:00', '02:00')).toBe(false);
  });
});

describe('slots — duplicate / conflicting records enter an explicit review path', () => {
  // Mirrors the real seed registry: two slots share one container number.
  const dupSlots: Slot[] = [
    {
      id: 'slot-1',
      plate: '78452-A-17',
      container: 'MSKU7392017',
      company: 'Sotransmar',
      line: 'Maersk',
      gate: 1,
      windowStart: '09:00',
      windowEnd: '11:00',
    },
    {
      id: 'slot-7',
      plate: '24680-G-55',
      container: 'MSKU7392017',
      company: 'Transports Bennis',
      line: 'CMA CGM',
      gate: 1,
      windowStart: '14:00',
      windowEnd: '16:00',
    },
  ];
  const morning = new Date('2026-10-12T10:00:00');
  const afternoon = new Date('2026-10-12T15:00:00');

  it('an exact two-field match wins even when another slot shares the container', () => {
    // Regression: the old OR-first lookup matched slot-1 by container and
    // reported a WRONG plate-mismatch for a truck that perfectly matched slot-7.
    const r = matchSlot('24680-G-55', 'MSKU7392017', dupSlots, afternoon);
    expect(r.status).toBe('match');
    expect(r.slot?.id).toBe('slot-7');
  });

  it('a duplicate container with an unknown plate is ambiguous, not a mismatch', () => {
    const r = matchSlot('00000-Z-00', 'MSKU7392017', dupSlots, morning);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates?.map((s) => s.id).sort()).toEqual(['slot-1', 'slot-7']);
    expect(r.detail).toMatch(/slot-1.*slot-7|slot-7.*slot-1/);
  });

  it('plate and container pointing at different slots is ambiguous, never a guess', () => {
    const r = matchSlot('78452-A-17', 'TCLU4829132', [
      ...dupSlots,
      {
        id: 'slot-3',
        plate: '33521-C-08',
        container: 'TCLU4829132',
        company: 'Transports Bennis',
        line: 'CMA CGM',
        gate: 2,
        windowStart: '08:00',
        windowEnd: '10:00',
      },
    ], morning);
    expect(r.status).toBe('ambiguous');
    expect(r.detail).toMatch(/conflicting/i);
  });

  it('duplicate full records (same plate+container twice) are ambiguous', () => {
    const twinned = [...dupSlots, { ...dupSlots[0], id: 'slot-1b' }];
    const r = matchSlot('78452-A-17', 'MSKU7392017', twinned, morning);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates?.map((s) => s.id).sort()).toEqual(['slot-1', 'slot-1b']);
  });

  it('a unique single-key hit still reports a plain mismatch', () => {
    const r = matchSlot('78452-A-17', 'GESU5567202', dupSlots, morning);
    expect(r.status).toBe('container-mismatch');
    expect(r.slot?.id).toBe('slot-1');
  });

  it('unknown plate and container is an explicit no-slot', () => {
    const r = matchSlot('00000-Z-00', 'GESU5567202', dupSlots, morning);
    expect(r.status).toBe('no-slot');
    expect(r.slot).toBeUndefined();
  });

  it('empty reads never match a slot', () => {
    const r = matchSlot('', '', dupSlots, morning);
    expect(r.status).toBe('no-slot');
  });
});
