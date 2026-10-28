import { describe, it, expect } from 'vitest';
import {
  checkDigitFor,
  normalizeContainer,
  parseContainer,
  isValidContainer,
  extractContainerCandidates,
} from './iso6346';

describe('iso6346', () => {
  it('computes check digits', () => {
    expect(checkDigitFor('TCLU482913')).toBe(2);
    expect(checkDigitFor('MSKU739201')).toBe(7);
    expect(checkDigitFor('GESU556720')).toBe(2);
    expect(checkDigitFor('FCIU908134')).toBe(3);
    expect(checkDigitFor('BMOU512840')).toBe(2);
    expect(checkDigitFor('TGHU390511')).toBe(3);
  });

  it('computes the textbook ISO 6346 worked example CSQU305438-3', () => {
    // C=13, S=30, Q=28, U=32, then digits 3,0,5,4,3,8 with weights
    // 2^0..2^9: 13 + 60 + 112 + 256 + 48 + 0 + 320 + 512 + 768 + 4096
    // = 6185; 6185 mod 11 = 3.
    expect(checkDigitFor('CSQU305438')).toBe(3);
    expect(parseContainer('CSQU305438-3')).toMatchObject({ valid: true });
  });

  it('normalizes container numbers', () => {
    expect(normalizeContainer('tclu 482913-2')).toBe('TCLU4829132');
  });

  it('parses valid container', () => {
    expect(parseContainer('TCLU482913-2')).toMatchObject({
      owner: 'TCLU',
      serial: '482913',
      check: '2',
      valid: true,
    });
  });

  it('parses invalid check digit', () => {
    expect(parseContainer('TCLU482913-3')).toMatchObject({
      valid: false,
      reason: 'bad-check-digit',
    });
  });

  it('returns null for malformed or empty input', () => {
    expect(parseContainer('ABC123')).toBeNull();
    expect(parseContainer('')).toBeNull();
  });

  it('validates container numbers', () => {
    expect(isValidContainer('MSKU739201-7')).toBe(true);
    expect(isValidContainer('MSKU739201-8')).toBe(false);
  });

  it('extracts container candidates', () => {
    expect(extractContainerCandidates('Box TCLU 482913-2 arrived')).toEqual(['TCLU4829132']);
    expect(extractContainerCandidates('TCLU 482913-2 and TCLU4829132')).toEqual(['TCLU4829132']);
    expect(extractContainerCandidates('no numbers here')).toEqual([]);
  });

  it('maps a mod-11 remainder of 10 to check digit 0', () => {
    // ABCD000009 sums to a multiple-of-11-plus-10, so ISO 6346 maps the
    // check digit 10 -> 0. Guards the `mod === 10 ? 0` branch.
    expect(checkDigitFor('ABCD000009')).toBe(0);
    expect(parseContainer('ABCD000009-0')).toMatchObject({ valid: true });
    expect(parseContainer('ABCD000009-1')).toMatchObject({ valid: false });
  });

  it('rejects wrong lengths, bad characters, and truncated numbers', () => {
    expect(parseContainer('TCLU482913')).toBeNull(); // 10 chars, no check digit
    expect(parseContainer('TCLU48291322')).toBeNull(); // 12 chars
    expect(parseContainer('1234482913-2')).toBeNull(); // digits where letters belong
    expect(parseContainer('TCLU48291A-2')).toBeNull(); // letter in serial
    expect(parseContainer('TC1U482913-2')).toBeNull(); // digit in owner code
    expect(isValidContainer('TCLU48291-2')).toBe(false);
  });

  it('normalizes case and separators before validating', () => {
    expect(isValidContainer('tclu482913-2')).toBe(true);
    expect(isValidContainer('TCLU 482913 2')).toBe(true);
    expect(parseContainer('msku739201-7')).toMatchObject({ valid: true, owner: 'MSKU' });
  });

  it('a valid check digit means well-formed, not verified identity', () => {
    // Any 11-char string with a correct check digit parses as valid —
    // the check digit is a typo trap, not proof the container exists.
    // ABCD000009-0 is well-formed but belongs to no real registry.
    expect(isValidContainer('ABCD000009-0')).toBe(true);
    // Identity is established by matching the appointment registry
    // (see slots.matchSlot), never by the check digit alone.
  });
});
