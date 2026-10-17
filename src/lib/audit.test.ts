/**
 * Audit trail tests: append-only, contract-validated, DEMO banner pinned.
 */
import { describe, expect, it } from 'vitest';
import {
  AUDIT_STORE_BANNER,
  AuditStore,
  AuditEventSchema,
} from './audit';

describe('AuditStore', () => {
  it('appends validated events oldest-first', () => {
    const store = new AuditStore();
    store.append({
      recordedAtUtc: '2026-10-17T12:00:00Z',
      actor: 'dev-supervisor',
      actorRole: 'supervisor',
      action: 'gate-decision',
      gateEventId: 'evt-1',
      decision: 'authorized',
      reasonCodes: ['verified-match'],
      appointmentId: 'slot-1',
    });
    store.append({
      recordedAtUtc: '2026-10-17T12:01:00Z',
      actor: 'dev-operator',
      actorRole: 'operator',
      action: 'decision-override',
      gateEventId: 'evt-2',
      decision: 'denied',
      reasonCodes: ['plate-mismatch'],
    });
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].gateEventId).toBe('evt-1');
    expect(list[1].gateEventId).toBe('evt-2');
    expect(store.length).toBe(2);
  });

  it('pins the DEMO-ONLY banner on every record', () => {
    const store = new AuditStore();
    const entry = store.append({
      recordedAtUtc: '2026-10-17T12:00:00Z',
      actor: 'dev-operator',
      actorRole: 'operator',
      action: 'quarantine',
      reasonCodes: ['stored payload is not valid JSON'],
    });
    expect(entry.store).toBe(AUDIT_STORE_BANNER);
    expect(() =>
      AuditEventSchema.parse({ ...entry, store: 'REAL AUDIT' }),
    ).toThrow();
  });

  it('throws on invalid input — the trail never silently accepts malformed records', () => {
    const store = new AuditStore();
    expect(() =>
      store.append({
        recordedAtUtc: 'not-a-date',
        actor: '',
        actorRole: 'operator',
        action: 'gate-decision',
        reasonCodes: [],
      }),
    ).toThrow();
    expect(store.length).toBe(0);
  });

  it('returns copies so callers cannot mutate the trail', () => {
    const store = new AuditStore();
    store.append({
      recordedAtUtc: '2026-10-17T12:00:00Z',
      actor: 'dev-operator',
      actorRole: 'operator',
      action: 'gate-decision',
      reasonCodes: [],
    });
    const list = store.list();
    (list[0] as { actor: string }).actor = 'tampered';
    expect(store.list()[0].actor).toBe('dev-operator');
  });

  it('assigns an id when none is given', () => {
    const store = new AuditStore();
    const entry = store.append({
      recordedAtUtc: '2026-10-17T12:00:00Z',
      actor: 'dev-operator',
      actorRole: 'operator',
      action: 'review-decision',
      reasonCodes: [],
    });
    expect(entry.id).toMatch(/^audit-/);
  });
});
