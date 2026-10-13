/**
 * OCR evaluation metrics: Levenshtein distance, character error rate
 * (CER), word error rate (WER), field accuracy, and confusion pairs.
 *
 * Definitions (standard in OCR / speech evaluation):
 * - CER = (substitutions + deletions + insertions) / characters in reference.
 * - WER = (substitutions + deletions + insertions) / words in reference,
 *   computed on whitespace-split tokens.
 * Both are edit-distance rates; 0 = perfect, 1 = every character/word
 * wrong, >1 possible when the hypothesis inserts extra material.
 */

/** Classic dynamic-programming Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Character error rate of `hypothesis` against `reference`. */
export function cer(reference: string, hypothesis: string): number {
  if (reference.length === 0) return hypothesis.length === 0 ? 0 : 1;
  return levenshtein(reference, hypothesis) / reference.length;
}

/** Word error rate of `hypothesis` against `reference` (whitespace tokens). */
export function wer(reference: string, hypothesis: string): number {
  const refWords = reference.trim().split(/\s+/).filter(Boolean);
  const hypWords = hypothesis.trim().split(/\s+/).filter(Boolean);
  if (refWords.length === 0) return hypWords.length === 0 ? 0 : 1;
  return levenshteinTokens(refWords, hypWords) / refWords.length;
}

/** Levenshtein distance over token arrays (word-level edit distance). */
export function levenshteinTokens(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Field accuracy: fraction of expected fields recovered exactly.
 * @param expected list of expected field values (e.g. [plate, container]).
 * @param got list of recovered field values, same order; '' = missed.
 */
export function fieldAccuracy(expected: string[], got: string[]): number {
  if (expected.length === 0) return 1;
  let correct = 0;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== '' && got[i] === expected[i]) correct++;
  }
  return correct / expected.length;
}

/** One aligned substitution: reference char `from` read as `to`. */
export type ConfusionPair = { from: string; to: string };

/**
 * Backtraces the Levenshtein alignment between `reference` and
 * `hypothesis` and returns the substitution pairs (insertions and
 * deletions are not confusions — they carry no `from → to` mapping).
 * Whitespace and separator characters are skipped: only alphanumeric
 * confusions are counted, so "MSKU-7392017" vs "MSKU7392017" yields none.
 */
export function alignSubstitutions(reference: string, hypothesis: string): ConfusionPair[] {
  const m = reference.length;
  const n = hypothesis.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const pairs: ConfusionPair[] = [];
  let i = m;
  let j = n;
  const isAlnum = (ch: string) => /[A-Za-z0-9]/.test(ch);
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        if (cost === 1 && isAlnum(reference[i - 1]) && isAlnum(hypothesis[j - 1])) {
          pairs.push({ from: reference[i - 1], to: hypothesis[j - 1] });
        }
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      i--; // deletion — no confusion pair
    } else if (j > 0) {
      j--; // insertion — no confusion pair
    } else {
      break;
    }
  }
  return pairs.reverse();
}

/** Counts confusion pairs into a "FROM→TO" → count map. */
export function countConfusions(pairs: ConfusionPair[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of pairs) {
    const key = `${p.from}→${p.to}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Builds a ranked confusion table from many (reference, hypothesis)
 * string pairs — e.g. all benchmark errors, or all review corrections.
 */
export function confusionTable(
  stringPairs: Array<{ reference: string; hypothesis: string }>,
): Array<{ from: string; to: string; count: number }> {
  const counts = new Map<string, number>();
  for (const { reference, hypothesis } of stringPairs) {
    for (const [key, n] of countConfusions(alignSubstitutions(reference, hypothesis))) {
      counts.set(key, (counts.get(key) ?? 0) + n);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('→');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
}
