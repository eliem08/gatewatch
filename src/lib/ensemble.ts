/**
 * Ensemble OCR: run Tesseract with several page-segmentation modes and
 * combine the reads by voting.
 *
 * Why ensemble? A single Tesseract pass commits to one layout analysis;
 * on gate photos the layout guess is often the failure (a plate band read
 * as one text line vs. sparse text vs. a single word). Different PSM
 * modes make *different* mistakes, so a majority vote across modes —
 * weighted by each pass's confidence — cancels uncorrelated errors.
 * This is the same principle behind multi-engine OCR combination
 * (Lund & Ringger 2009) and multi-binarization voting
 * (Lund, Kennard & Ringger 2013): combine diverse, imperfect reads
 * rather than trusting one.
 *
 * The voting here is field-level, not string-level: each engine's raw
 * text is parsed into plate/container candidates (see plates.ts /
 * iso6346.ts), then candidates are grouped and scored. Field-level
 * voting is robust to engines that hallucinate extra lines — only the
 * structured fields count.
 */
import { extractContainerCandidates } from './iso6346';
import { extractPlateCandidates } from './plates';

export type EngineRead = {
  /** Tesseract page-segmentation mode used for this pass. */
  psm: string;
  /** Raw OCR text from this pass. */
  text: string;
  /** Tesseract confidence, 0–100. */
  confidence: number;
  /** Pass duration in ms. */
  ms: number;
};

export type FieldVote = {
  /** Winning value ('' when no engine produced a candidate). */
  value: string;
  /** How many engines voted for the winner. */
  votes: number;
  /** Total engines that produced any candidate for this field. */
  enginesWithCandidate: number;
  /** Confidence-weighted score of the winner. */
  weightedScore: number;
  /** All distinct candidates with their vote counts, best first. */
  candidates: Array<{ value: string; votes: number; weightedScore: number }>;
};

/** The PSM modes used by the ensemble (see ocr.ts PsmMode for the full set). */
export const ENSEMBLE_PSMS = ['6', '7', '11', '13'] as const;

/**
 * Votes among candidate values. Each vote carries the engine's
 * confidence as its weight; ties break toward the candidate backed by
 * more engines, then by higher total weight.
 */
export function voteCandidates(
  votes: Array<{ value: string; confidence: number }>,
): FieldVote {
  const byValue = new Map<string, { votes: number; weightedScore: number }>();
  for (const v of votes) {
    const row = byValue.get(v.value) ?? { votes: 0, weightedScore: 0 };
    row.votes += 1;
    row.weightedScore += Math.max(0, v.confidence);
    byValue.set(v.value, row);
  }
  const candidates = [...byValue.entries()]
    .map(([value, row]) => ({ value, ...row }))
    .sort((a, b) => b.weightedScore - a.weightedScore || b.votes - a.votes || a.value.localeCompare(b.value));
  const winner = candidates[0];
  return {
    value: winner?.value ?? '',
    votes: winner?.votes ?? 0,
    enginesWithCandidate: votes.length,
    weightedScore: winner?.weightedScore ?? 0,
    candidates,
  };
}

export type EnsembleResult = {
  plate: FieldVote;
  container: FieldVote;
  /** Per-engine parsed reads (for the agreement panel). */
  perEngine: Array<{
    psm: string;
    confidence: number;
    ms: number;
    plate: string;
    container: string;
  }>;
  /**
   * Fraction of engines that produced the winning plate AND container
   * (when a field has a winner). 1 = unanimous, 0 = total disagreement.
   */
  agreement: number;
  /** Raw concatenated text across engines (for the raw-text view). */
  combinedText: string;
};

/**
 * Combines several engine reads into voted plate/container fields.
 * Engines that produced no candidate for a field simply abstain.
 */
export function combineEngineReads(reads: EngineRead[]): EnsembleResult {
  const perEngine = reads.map((r) => ({
    psm: r.psm,
    confidence: r.confidence,
    ms: r.ms,
    plate: extractPlateCandidates(r.text)[0] ?? '',
    container: extractContainerCandidates(r.text)[0] ?? '',
  }));
  const plateVotes = perEngine
    .filter((e) => e.plate !== '')
    .map((e) => ({ value: e.plate, confidence: e.confidence }));
  const containerVotes = perEngine
    .filter((e) => e.container !== '')
    .map((e) => ({ value: e.container, confidence: e.confidence }));
  const plate = voteCandidates(plateVotes);
  const container = voteCandidates(containerVotes);

  // Agreement: mean over fields of (winner votes / engines with candidate).
  const ratios: number[] = [];
  if (plate.enginesWithCandidate > 0) ratios.push(plate.votes / plate.enginesWithCandidate);
  if (container.enginesWithCandidate > 0) ratios.push(container.votes / container.enginesWithCandidate);
  const agreement = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

  return {
    plate,
    container,
    perEngine,
    agreement,
    combinedText: reads.map((r) => r.text).join('\n'),
  };
}
