/**
 * BIC owner-code registry (partial).
 *
 * A container's first 4 letters are its owner code, registered with the
 * Bureau International des Containers (BIC). The 4th letter is the
 * equipment category: U = freight container, J = detachable equipment,
 * Z = trailer/chassis. This registry covers the major carriers and
 * lessors seen at Casablanca; it is PARTIAL by design — the full BIC
 * register holds thousands of codes and changes as lines merge and
 * lessors rebrand. An unknown code is not an error; it just is not in
 * this demo registry.
 *
 * Codes verified against public carrier/SCAC listings (see README
 * references). Note the SCAC/BIC overlap: ONEY and HDMU are SCAC codes
 * that also appear as equipment prefixes; ONE's BIC prefix is ONEU and
 * HMM also uses HMMU — both are listed so either reading resolves.
 */

export type OwnerKind = 'carrier' | 'lessor';

export type OwnerEntry = {
  line: string;
  kind: OwnerKind;
  /** Note on mergers / alternate codes. */
  note?: string;
};

export const OWNER_REGISTRY: Record<string, OwnerEntry> = {
  // Carriers
  MSKU: { line: 'Maersk', kind: 'carrier', note: 'Also MAEU, MRKU (legacy P&O Nedlloyd PONU).' },
  MAEU: { line: 'Maersk', kind: 'carrier' },
  MSCU: { line: 'MSC (Mediterranean Shipping Company)', kind: 'carrier', note: 'Also MEDU, MSDU.' },
  CMAU: { line: 'CMA CGM', kind: 'carrier', note: 'Also APLU (APL), ANNU (ANL) from acquisitions.' },
  HLCU: { line: 'Hapag-Lloyd', kind: 'carrier', note: 'Also HLXU, HLBU, UACU (ex-UASC).' },
  COSU: { line: 'COSCO Shipping', kind: 'carrier', note: 'Also CSNU, CBHU, CSQU (ex-China Shipping).' },
  CSQU: { line: 'COSCO Shipping (ex-China Shipping)', kind: 'carrier' },
  EGLV: { line: 'Evergreen', kind: 'carrier', note: 'Also EISU, EGHU, EGSU.' },
  EISU: { line: 'Evergreen', kind: 'carrier' },
  ONEU: { line: 'ONE (Ocean Network Express)', kind: 'carrier', note: 'BIC prefix. ONEY is ONE’s SCAC code.' },
  ONEY: { line: 'ONE (Ocean Network Express)', kind: 'carrier', note: 'SCAC code; BIC prefix is ONEU.' },
  HDMU: { line: 'HMM (Hyundai Merchant Marine)', kind: 'carrier', note: 'Also HMMU.' },
  HMMU: { line: 'HMM (Hyundai Merchant Marine)', kind: 'carrier' },
  ZIMU: { line: 'ZIM Integrated Shipping Services', kind: 'carrier', note: 'Also ZCSU, ZMOU.' },
  YMLU: { line: 'Yang Ming', kind: 'carrier', note: 'Also YMMU.' },
  OOLU: { line: 'OOCL (Orient Overseas Container Line)', kind: 'carrier' },
  APLU: { line: 'APL (now CMA CGM group)', kind: 'carrier' },
  SUDU: { line: 'Hamburg Süd (now Maersk group)', kind: 'carrier' },
  // Lessors — a large share of the world fleet is leased, so the code on
  // the box often names the lessor, not the operating carrier.
  TCLU: { line: 'Triton (lessor)', kind: 'lessor', note: 'Also TRHU, TTNU.' },
  TRHU: { line: 'Triton (lessor)', kind: 'lessor' },
  TGHU: { line: 'Textainer (lessor)', kind: 'lessor', note: 'Also WCIU.' },
  FCIU: { line: 'Florens (lessor, COSCO group)', kind: 'lessor' },
  GESU: { line: 'GE SeaCo / GATX (lessor)', kind: 'lessor', note: 'Also UFCU, XTRU.' },
  BEAU: { line: 'Beacon Intermodal (lessor)', kind: 'lessor' },
};

/**
 * Looks up the 4-letter owner code of a container number.
 * @param container full container number (normalization tolerant).
 * @returns the registry entry, or null when the code is not listed.
 */
export function lookupOwner(container: string): OwnerEntry | null {
  if (!container) return null;
  const code = container.toUpperCase().replace(/[\s-]/g, '').slice(0, 4);
  return OWNER_REGISTRY[code] ?? null;
}
