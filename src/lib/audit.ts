/**
 * Append-only audit trail for gate decisions.
 *
 * Phase C — DEMO-ONLY AUDIT STORE. Entries are validated against the
 * `AuditEvent` contract and kept append-only in memory, optionally mirrored
 * to the visitor's browser localStorage. This is a demo trail, not a
 * tamper-evident audit log: anyone with devtools can rewrite it, there is
 * no server signature, no access control, no cross-browser visibility.
 * Production needs a server-side append-only log (WORM store or signed
 * hash chain) written by the authorization service itself.
 *
 * The `store` field on every record carries the DEMO banner so no
 * consumer can mistake these entries for operational evidence.
 */

import { z } from 'zod';

export const AUDIT_STORE_BANNER =
  'DEMO-ONLY audit trail — browser-local, no tamper evidence, not operational evidence.' as const;

/** Version of the audit-event contract. */
export const AUDIT_EVENT_CONTRACT_VERSION = '1.0.0' as const;

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  /** ISO 8601 UTC timestamp of when the audit entry was recorded. */
  recordedAtUtc: z.iso.datetime(),
  /** Verified-in-production identity; dev: the mock user id. */
  actor: z.string().min(1),
  actorRole: z.string().min(1),
  action: z.enum([
    'gate-decision',
    'decision-override',
    'review-decision',
    'quarantine',
    'upload-rejected',
  ]),
  /** Id of the gate event this entry refers to, when there is one. */
  gateEventId: z.string().min(1).optional(),
  decision: z.enum(['authorized', 'manual-review', 'denied']).optional(),
  /** OCR confidences at decision time, when applicable. */
  confidence: z
    .object({
      container: z.number().finite(),
      plate: z.number().finite(),
    })
    .optional(),
  reasonCodes: z.array(z.string()),
  appointmentId: z.string().min(1).optional(),
  /** Always the DEMO banner — no silent promotion to a real trail. */
  store: z.literal(AUDIT_STORE_BANNER),
  contractVersion: z.literal(AUDIT_EVENT_CONTRACT_VERSION),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export type AuditEventInput = Omit<AuditEvent, 'id' | 'store' | 'contractVersion'> & {
  id?: string;
};

let seq = 0;
function nextAuditId(): string {
  seq += 1;
  return `audit-${Date.now().toString(36)}-${seq}`;
}

const STORAGE_KEY = 'gatewatch.audit.v1';

/**
 * Append-only audit store. `append` validates against the contract and
 * throws on invalid input (fail loudly at write time — the audit trail is
 * the one place that must never silently accept malformed records).
 * `list()` returns entries oldest-first; there is no update or delete.
 */
export class AuditStore {
  private entries: AuditEvent[] = [];

  constructor(opts: { persist?: boolean } = {}) {
    if (opts.persist) this.load();
  }

  append(input: AuditEventInput): AuditEvent {
    const event = AuditEventSchema.parse({
      ...input,
      id: input.id ?? nextAuditId(),
      store: AUDIT_STORE_BANNER,
      contractVersion: AUDIT_EVENT_CONTRACT_VERSION,
    });
    this.entries.push(event);
    return event;
  }

  /** Entries oldest-first. Returns copies so callers cannot mutate the trail. */
  list(): AuditEvent[] {
    return this.entries.map((e) => ({ ...e }));
  }

  get length(): number {
    return this.entries.length;
  }

  /** Dev-only escape hatch, labeled: production audit stores have no clear. */
  clearDevOnly(): void {
    this.entries = [];
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  private load(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid: AuditEvent[] = [];
      for (const item of parsed) {
        const res = AuditEventSchema.safeParse(item);
        if (res.success) valid.push(res.data);
        // Invalid persisted audit entries are dropped from memory here —
        // the raw payload stays in localStorage untouched for inspection.
      }
      this.entries = valid;
    } catch {
      /* corrupted audit payload — start empty, never crash */
    }
  }
}

/** Serializes the in-memory trail for the optional localStorage mirror. */
export function serializeAudit(entries: AuditEvent[]): string {
  return JSON.stringify(entries);
}
