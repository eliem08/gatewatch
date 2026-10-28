/**
 * Phase D — ISO 6346 check-digit edge sweep.
 *
 * Exhaustive-ish coverage of the math the demo relies on:
 * - the mod-11 → 10 ⇒ check digit 0 branch, across many prefixes;
 * - transposition sensitivity: WHICH transpositions the check digit
 *   catches and which it provably cannot (letter pairs whose values
 *   differ by a multiple of 11 — e.g. A=10 vs K=21);
 * - single-character substitution: digits always caught, letters caught
 *   except the mod-11-congruent blind spots;
 * - double-error cancellation (A↔K swap across positions) — the sharpest
 *   demonstration that a valid check digit ≠ identity.
 *
 * Every blind spot found here is pinned as a test so the UI/docs claim
 * "valid check digit ≠ identity" stays empirically true.
 */
import { describe, it, expect } from 'vitest';
import {
  checkDigitFor,
  isValidContainer,
  CONTAINER_LETTER_VALUES,
} from './iso6346';

/** Numeric value of one container-number character (letters + digits). */
function charValue(ch: string): number {
  if (ch >= '0' && ch <= '9') return parseInt(ch, 10);
  return CONTAINER_LETTER_VALUES[ch] ?? NaN;
}

/** Deterministic valid numbers: owner + strided serials + check digit.
 *  The stride spreads digits across positions so adjacent-swap sweeps hit
 *  mostly non-identity pairs (sequential serials are runs of zeros). */
function validNumbers(owner: string, count: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    const serial = (k * 7919 + 13) % 1000000;
    const prefix = owner + String(serial).padStart(6, '0');
    out.push(prefix + String(checkDigitFor(prefix)));
  }
  return out;
}

/**
 * Exact modular-arithmetic oracle for single-edit validity — an
 * independent reimplementation of the check logic used to cross-check
 * isValidContainer (loop-based) against the underlying math.
 *
 * f maps remainder 10 -> check digit 0; it is injective EXCEPT
 * f(10) = f(0) = 0, which is the extra collision class the sweep below
 * pins down (a transposition/substitution can escape detection by moving
 * the remainder between 0 and 10).
 */
const f10 = (r: number): number => (r === 10 ? 0 : r);

function remainder10(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += charValue(first10[i]) * 2 ** i;
  return ((sum % 11) + 11) % 11;
}

const mod11 = (x: number): number => ((x % 11) + 11) % 11;

/** Expected validity after swapping positions i<j of a valid number. */
function swapExpectedValid(n: string, i: number, j: number): boolean {
  const vi = charValue(n[i]);
  const vj = charValue(n[j]);
  const r = remainder10(n.slice(0, 10));
  if (j < 10) {
    const delta = mod11((vi - vj) * (2 ** j - 2 ** i));
    return f10(mod11(r + delta)) === f10(r);
  }
  // j === 10: swapping with the check digit itself. The weighted sum only
  // covers positions 0..9, and the moved digit becomes the new check char.
  const delta = mod11((vj - vi) * 2 ** i);
  return f10(mod11(r + delta)) === vi;
}

/** Expected validity after substituting position i with letter/digit L. */
function subExpectedValid(n: string, i: number, newChar: string): boolean {
  const r = remainder10(n.slice(0, 10));
  const delta = mod11((charValue(newChar) - charValue(n[i])) * 2 ** i);
  return f10(mod11(r + delta)) === f10(r);
}

describe('ISO 6346 edge sweep', () => {
  it('maps mod-11 remainder 10 to check digit 0 across many prefixes', () => {
    // Deterministic search: ~1/11 of serials hit the mod-10 branch.
    const found: string[] = [];
    for (let serial = 0; serial < 20000 && found.length < 25; serial++) {
      const prefix = 'TCLU' + String(serial).padStart(6, '0');
      let sum = 0;
      for (let i = 0; i < 10; i++) sum += charValue(prefix[i]) * 2 ** i;
      if (sum % 11 === 10) found.push(prefix);
    }
    expect(found.length).toBe(25); // the branch is reachable, not a fluke
    for (const prefix of found) {
      expect(checkDigitFor(prefix)).toBe(0);
      expect(isValidContainer(prefix + '0')).toBe(true);
      // ...and the *unmapped* digit 10 can never appear: '0' is the digit.
      expect(isValidContainer(prefix + '1')).toBe(false);
    }
  });

  it('transpositions match the modular oracle exactly — detection rule plus the 10→0 collision', () => {
    // For swaps inside the first 10 positions the rule is: caught iff
    // (a-b)(2^j - 2^i) is nonzero mod 11, i.e. iff the swapped values
    // differ mod 11 — EXCEPT the f(10)=f(0)=0 collision, where a swap can
    // move the remainder between 0 and 10 and still validate. The oracle
    // encodes both; the implementation must agree on every adjacent swap.
    const numbers = validNumbers('MSKU', 40).concat(validNumbers('AKSU', 10));
    let caught = 0;
    let blind = 0;
    let checkDigitSwaps = 0;
    for (const n of numbers) {
      for (let i = 0; i < 10; i++) {
        const a = n[i];
        const b = n[i + 1];
        if (a === b) continue; // identity, not a transposition
        const t = n.slice(0, i) + b + a + n.slice(i + 2);
        const expected = swapExpectedValid(n, i, i + 1);
        expect(isValidContainer(t)).toBe(expected);
        if (i === 9) checkDigitSwaps += 1;
        else if (expected) blind += 1;
        // `expected` true = the transposition still validates = escaped.
        else caught += 1;
      }
    }
    expect(caught).toBeGreaterThan(100);
    expect(blind).toBeGreaterThan(0); // mod-11-congruent letter pairs exist
    expect(checkDigitSwaps).toBeGreaterThan(0);
  });

  it('documents the 10→0 collision: a digit transposition can escape on check-digit-0 numbers', () => {
    // MSKU0000310 is valid with check digit 0 (remainder 10); swapping
    // the 0 and 3 moves the remainder 10 -> 0, and f(10) = f(0) = 0, so
    // the transposed number still validates. Found empirically, pinned
    // here so the collision class is never silently "fixed" away.
    expect(isValidContainer('MSKU0000310')).toBe(true);
    expect(isValidContainer('MSKU0003010')).toBe(true);
  });

  it('single-character substitutions match the modular oracle exactly', () => {
    const n = validNumbers('GESU', 1)[0];
    // Every digit position: the oracle decides (the 10→0 collision can
    // let a non-identity digit substitution through on check-digit-0
    // numbers — the implementation must match the math, whatever it is).
    for (let i = 4; i < 11; i++) {
      for (let d = 0; d <= 9; d++) {
        const sub = n.slice(0, i) + String(d) + n.slice(i + 1);
        if (sub === n) continue;
        expect(isValidContainer(sub)).toBe(subExpectedValid(n, i, String(d)));
      }
    }
    // Every letter position: alternative letters, oracle-decided. The
    // mod-11-congruent pairs (A=10 vs K=21 vs U=32) are the structural
    // blind spots; the 10→0 collision adds rare extras.
    let letterBlind = 0;
    for (let i = 0; i < 4; i++) {
      for (let c = 65; c <= 90; c++) {
        const letter = String.fromCharCode(c);
        const sub = n.slice(0, i) + letter + n.slice(i + 1);
        if (sub === n) continue;
        const expected = subExpectedValid(n, i, letter);
        expect(isValidContainer(sub)).toBe(expected);
        if (expected) letterBlind += 1;
      }
    }
    expect(letterBlind).toBeGreaterThan(0);
  });

  it('demonstrates valid-check-digit ≠ identity: an A↔K position swap still validates', () => {
    // A=10, K=21: swapping them across two positions changes the sum by
    // ±11·(2^i − 2^j) ≡ 0 (mod 11). The string is different, the check
    // digit is still right, and no real container changed hands.
    const prefix = 'AKSU123456';
    const valid = prefix + String(checkDigitFor(prefix));
    expect(isValidContainer(valid)).toBe(true);
    const swapped = 'KASU123456' + valid.slice(10);
    expect(swapped).not.toBe(valid);
    expect(isValidContainer(swapped)).toBe(true);
    // Same for a single A→K substitution (values differ by exactly 11).
    const sub = 'K' + valid.slice(1);
    expect(isValidContainer(sub)).toBe(true);
    // ...while A→B (values 10→12) is caught.
    expect(isValidContainer('B' + valid.slice(1))).toBe(false);
  });

  it('congruence classes mod 11 are exactly the blind-spot pairs', () => {
    // Sanity on the letter table itself: list every letter pair sharing
    // a mod-11 class, so a future table edit that breaks the analysis
    // fails loudly here instead of silently.
    const classes = new Map<number, string[]>();
    for (const [letter, value] of Object.entries(CONTAINER_LETTER_VALUES)) {
      const k = value % 11;
      classes.set(k, [...(classes.get(k) ?? []), letter]);
    }
    const multi = [...classes.values()].filter((g) => g.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    // A, K, U are the classic triple (10, 21, 32).
    const aku = classes.get(10 % 11)!;
    expect(aku).toEqual(expect.arrayContaining(['A', 'K', 'U']));
  });
});
