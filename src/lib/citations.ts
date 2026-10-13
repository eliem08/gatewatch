/**
 * References for the methodology section. Every entry was verified to
 * exist before being cited — no paper is cited from memory alone.
 */

export type Citation = {
  authors: string;
  year: number;
  title: string;
  venue: string;
  /** What GateWatch takes from this work. */
  relevance: string;
};

export const CITATIONS: Citation[] = [
  {
    authors: 'Nobuyuki Otsu',
    year: 1979,
    title: 'A Threshold Selection Method from Gray-Level Histograms',
    venue: 'IEEE Transactions on Systems, Man, and Cybernetics, 9(1), 62–66',
    relevance: 'Otsu thresholding: the global binarization step of the preprocessing pipeline.',
  },
  {
    authors: 'Ray Smith',
    year: 2007,
    title: 'An Overview of the Tesseract OCR Engine',
    venue: 'Proc. 9th Int. Conf. on Document Analysis and Recognition (ICDAR), vol. 2, 629–633',
    relevance: 'The OCR engine used here; documents Tesseract’s line finding and character classification.',
  },
  {
    authors: 'William B. Lund and Eric K. Ringger',
    year: 2009,
    title: 'Improving Optical Character Recognition through Efficient Multiple System Alignment',
    venue: 'Proc. 9th ACM/IEEE-CS Joint Conf. on Digital Libraries (JCDL), 231–240 — Best Student Paper',
    relevance: 'Motivation for ensemble OCR: aligning and combining the outputs of multiple OCR systems reduces errors no single system catches.',
  },
  {
    authors: 'William B. Lund, Douglas J. Kennard, and Eric K. Ringger',
    year: 2013,
    title: 'Combining Multiple Thresholding Binarization Values to Improve OCR Output',
    venue: 'Proc. Document Recognition and Retrieval (DRR) XX',
    relevance: 'Motivation for running OCR over several preprocessed variants of the same image and voting.',
  },
  {
    authors: 'Vladimir I. Levenshtein',
    year: 1966,
    title: 'Binary Codes Capable of Correcting Deletions, Insertions, and Reversals',
    venue: 'Soviet Physics Doklady, 10(8), 707–710',
    relevance: 'Edit distance — the basis of the CER / WER metrics in the evaluation harness.',
  },
  {
    authors: 'Christos-Nikolaos E. Anagnostopoulos, Ioannis E. Anagnostopoulos, Vassili Loumos, and Eleftherios Kayafas',
    year: 2008,
    title: 'License Plate Recognition From Still Images and Video Sequences: A Survey',
    venue: 'IEEE Transactions on Intelligent Transportation Systems, 9(3), 377–391',
    relevance: 'Survey of ANPR pipelines (plate localization → segmentation → recognition) and their failure modes; frames the gap between browser OCR and production ANPR.',
  },
  {
    authors: 'International Organization for Standardization',
    year: 2022,
    title: 'ISO 6346:2022 — Freight containers — Coding, identification and marking',
    venue: 'ISO standard',
    relevance: 'Defines the container numbering scheme and check-digit algorithm validated by this app.',
  },
];
