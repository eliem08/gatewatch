import { describe, it, expect } from 'vitest';
import { lookupOwner } from './owners';

describe('owners', () => {
  it('resolves the major carriers', () => {
    expect(lookupOwner('MSKU7392017')?.line).toBe('Maersk');
    expect(lookupOwner('MSCU1234567')?.line).toContain('MSC');
    expect(lookupOwner('CMAU1234567')?.line).toBe('CMA CGM');
    expect(lookupOwner('HLCU1234567')?.line).toBe('Hapag-Lloyd');
    expect(lookupOwner('COSU1234567')?.line).toContain('COSCO');
    expect(lookupOwner('EGLV1234567')?.line).toBe('Evergreen');
    expect(lookupOwner('ONEU1234567')?.line).toContain('ONE');
    expect(lookupOwner('ONEY1234567')?.line).toContain('ONE');
    expect(lookupOwner('HDMU1234567')?.line).toContain('HMM');
    expect(lookupOwner('ZIMU1234567')?.line).toContain('ZIM');
    expect(lookupOwner('YMLU1234567')?.line).toBe('Yang Ming');
  });

  it('resolves lessors and tolerates lowercase/dashes', () => {
    expect(lookupOwner('tclU-4829132')?.kind).toBe('lessor');
    expect(lookupOwner('TGHU3905113')?.line).toContain('Textainer');
    expect(lookupOwner('GESU5567202')?.line).toContain('SeaCo');
  });

  it('returns null for unknown codes', () => {
    expect(lookupOwner('ZZZZ1234567')).toBeNull();
    expect(lookupOwner('')).toBeNull();
  });
});
