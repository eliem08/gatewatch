'use client';

/**
 * Phase C security console (DEV DEMO).
 *
 * Exercises the Phase C machinery end to end against clearly-labeled mock
 * infrastructure:
 * - DevMockAuthProvider with a role picker (viewer/operator/supervisor/admin).
 * - A contract-shaped gate event submitted twice through the idempotent
 *   store (second submit returns the original — no duplicate).
 * - manual-review → authorized override, which REQUIRES the supervisor
 *   role. As an operator the mock denies the override; the denial is shown
 *   exactly as the user would see it.
 * - Every override attempt appends to the DEMO-ONLY audit trail.
 *
 * Nothing here is security infrastructure: the mock trusts the role you
 * pick, the audit trail lives in your browser, and no gate is opened.
 * What a real provider must implement is documented in src/lib/auth.ts.
 */

import { useMemo, useState } from 'react';
import {
  DevMockAuthProvider,
  type Role,
  AuthorizationError,
} from '@/lib/auth';
import { overrideGateDecision } from '@/lib/decisions';
import { GateVerificationEventSchema, type GateVerificationEvent } from '@/lib/contracts';
import { GateEventStore } from '@/lib/idempotency';
import { AuditStore, AUDIT_STORE_BANNER, type AuditEvent } from '@/lib/audit';
import { userSafeError } from '@/lib/http';
import { getQuarantineRegister, type QuarantinedEntry } from '@/lib/storage';
import { Eyebrow, Card, SectionTitle, AmberActionButton, GhostActionButton } from '@/components/ui';
import QuarantineBanner from '@/components/QuarantineBanner';

const ROLES: Role[] = ['viewer', 'operator', 'supervisor', 'admin'];

function sampleManualReviewEvent(): GateVerificationEvent {
  return GateVerificationEventSchema.parse({
    id: `evt-${Date.now().toString(36)}`,
    scannedAtUtc: new Date().toISOString(),
    gateId: 'gate-1',
    direction: 'in',
    vehicle: { plate: '78452-A-17' },
    container: { number: 'MSKU7392017', checkDigitValid: true },
    ocr: { containerConfidence: 52, plateConfidence: 48, engine: 'tesseract.js' },
    appointmentRef: {},
    decision: 'manual-review',
    decidedBy: 'auto-verifier',
    reasonCodes: ['low-container-confidence', 'no-appointment-ref'],
    idempotencyKey: `console-demo-${Date.now().toString(36)}`,
  });
}

const AUDIT_KEY = 'gatewatch.audit.v1';

export default function SecurityConsolePage() {
  const [role, setRole] = useState<Role>('operator');
  const [log, setLog] = useState<string[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEvent[]>([]);
  const [quarantined] = useState<QuarantinedEntry[]>(() => getQuarantineRegister());

  const auth = useMemo(() => new DevMockAuthProvider(role, `Dev ${role}`), [role]);

  const push = (line: string) => setLog((prev) => [...prev.slice(-19), line]);

  const refreshAudit = () => {
    try {
      const raw = window.localStorage.getItem(AUDIT_KEY);
      const store = new AuditStore();
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) for (const e of parsed) {
          try { store.append({ ...e, id: undefined }); } catch { /* skip bad audit rows */ }
        }
      }
      setAuditEntries(store.list());
    } catch {
      setAuditEntries([]);
    }
  };

  const appendAudit = (entry: Parameters<AuditStore['append']>[0]) => {
    try {
      const store = new AuditStore();
      const raw = window.localStorage.getItem(AUDIT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) for (const e of parsed) {
          try { store.append({ ...e, id: undefined }); } catch { /* skip */ }
        }
      }
      store.append(entry);
      window.localStorage.setItem(AUDIT_KEY, JSON.stringify(store.list()));
      refreshAudit();
    } catch {
      /* audit mirror unavailable */
    }
  };

  const runIdempotencyDemo = () => {
    const store = new GateEventStore();
    const event = sampleManualReviewEvent();
    const first = store.submit(event);
    const retry = store.submit({ ...event, id: `evt-retry-${Date.now().toString(36)}` });
    push(`submit #1 → new event (duplicate: ${first.duplicate})`);
    push(`submit #2 (same idempotency key, new id) → duplicate: ${retry.duplicate}, returned id=${retry.event.id}`);
    push(`store holds ${store.length} event(s) — no duplicate created.`);
  };

  const runOverrideDemo = () => {
    const event = sampleManualReviewEvent();
    try {
      const res = overrideGateDecision(event, 'authorized', auth);
      push(`override manual-review → authorized: ALLOWED as ${role}.`);
      appendAudit({
        recordedAtUtc: res.overriddenAtUtc,
        actor: res.overriddenBy,
        actorRole: res.overriddenByRole,
        action: 'decision-override',
        gateEventId: event.id,
        decision: 'authorized',
        confidence: { container: event.ocr.containerConfidence, plate: event.ocr.plateConfidence },
        reasonCodes: res.event.reasonCodes,
        appointmentId: event.appointmentRef.appointmentId,
      });
    } catch (err) {
      const msg = err instanceof AuthorizationError ? err.message : userSafeError(err);
      push(`override manual-review → authorized: DENIED as ${role} — ${msg}`);
      appendAudit({
        recordedAtUtc: new Date().toISOString(),
        actor: auth.getCurrentUser().id,
        actorRole: role,
        action: 'decision-override',
        gateEventId: event.id,
        reasonCodes: ['override-denied'],
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#0B0F16] text-[#E8EDF5]">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-8 md:py-12">
        <section className="space-y-3">
          <Eyebrow>PHASE C — SECURITY CONSOLE</Eyebrow>
          <h1 className="font-display text-4xl leading-tight md:text-5xl">Authorization, done loudly.</h1>
          <p className="max-w-2xl text-sm text-[#8B98AD] md:text-base">
            Everything on this page runs against mock infrastructure, labeled as such. The RBAC rule
            under test: overriding a <span className="font-mono">manual-review</span> decision to{' '}
            <span className="font-mono">authorized</span> requires the{' '}
            <span className="font-mono">supervisor</span> role. Pick a role and try it.
          </p>
          <div className="rounded-lg border border-[#FFB300]/60 bg-[#2A2113] p-4 text-sm text-[#FFB300]">
            🧪 DEV-MOCK AUTH — the provider trusts whichever role you pick below. The audit trail is
            browser-local with no tamper evidence. Neither is security infrastructure.
          </div>
        </section>

        <QuarantineBanner entries={quarantined} />

        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <SectionTitle>1 · Dev role</SectionTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider ${
                    role === r ? 'bg-[#FFB300] text-black' : 'bg-[#1F2A3D] text-[#8B98AD]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-[#8B98AD]">
              Signed in as <span className="font-mono text-[#E8EDF5]">{auth.getCurrentUser().id}</span>{' '}
              (role: <span className="font-mono text-[#E8EDF5]">{role}</span>)
            </p>
          </Card>

          <Card>
            <SectionTitle>2 · Run the demos</SectionTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <AmberActionButton onClick={runIdempotencyDemo}>Idempotency: submit twice</AmberActionButton>
              <GhostActionButton onClick={runOverrideDemo}>Override: review → authorized</GhostActionButton>
              <GhostActionButton onClick={refreshAudit}>Refresh audit trail</GhostActionButton>
            </div>
            <div className="mt-4 space-y-1 rounded bg-[#0B0F16] p-3 font-mono text-[11px] text-[#8B98AD]">
              {log.length === 0 ? (
                <p>Run a demo — output appears here.</p>
              ) : (
                log.map((l, i) => <p key={i}>{l}</p>)
              )}
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Audit trail</SectionTitle>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#8B98AD]">
            {AUDIT_STORE_BANNER}
          </p>
          <div className="mt-3 space-y-2">
            {auditEntries.length === 0 ? (
              <Card>
                <p className="py-4 text-center text-sm text-[#8B98AD]">
                  No audit entries yet. Run the override demo — allowed AND denied attempts are recorded.
                </p>
              </Card>
            ) : (
              auditEntries.map((e) => (
                <div key={e.id} className="rounded-lg border border-[#1F2A3D] bg-[#111826] p-3 font-mono text-[11px] text-[#8B98AD]">
                  <span className="text-[#E8EDF5]">{e.action}</span>
                  {' · '}{e.actor} ({e.actorRole})
                  {e.decision ? ` · decision=${e.decision}` : ''}
                  {e.gateEventId ? ` · event=${e.gateEventId}` : ''}
                  <span className="block text-[#5B6B84]">{e.recordedAtUtc} · {e.reasonCodes.join(', ') || '—'}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
