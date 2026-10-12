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
