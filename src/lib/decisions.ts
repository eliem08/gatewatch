/**
 * Override path for gate decisions, with RBAC enforcement.
 *
 * The ONLY sanctioned way to move a gate decision between verdicts. The
 * rule under test: manual-review → authorized (and denied → authorized)
 * requires the `supervisor` role; the mock provider denies operators.
 *
 * Every override returns a NEW event object (the original is untouched)
 * with the decision updated and an audit-ready `override` annotation.
 * Callers are expected to append an AuditEvent (see audit.ts) with the
 * same details — this module does not persist anything itself.
 */

import {
  AuthorizationError,
  requiredRoleForOverride,
  type AuthProvider,
  type Role,
} from './auth';
import type { GateVerificationEvent } from './contracts';

export type GateDecision = GateVerificationEvent['decision'];

export type DecisionOverride = {
  /** The event with the decision replaced (original untouched). */
  event: GateVerificationEvent;
  /** Who authorized the override. */
  overriddenBy: string;
  /** Role that authorized the override. */
  overriddenByRole: Role;
  /** UTC ISO timestamp of the override. */
  overriddenAtUtc: string;
  previousDecision: GateDecision;
};

/**
 * Overrides a gate decision after an RBAC check.
 *
 * @param event the current verified event.
 * @param to the new decision.
 * @param auth the auth provider (dev: DevMockAuthProvider).
 * @param atUtc override timestamp; defaults to now.
 * @returns the override record with the updated event.
 * @throws AuthorizationError when the current user lacks the required role.
 */
export function overrideGateDecision(
  event: GateVerificationEvent,
  to: GateDecision,
  auth: AuthProvider,
  atUtc: string = new Date().toISOString(),
): DecisionOverride {
  const required = requiredRoleForOverride(event.decision, to);
  const user = auth.getCurrentUser();
  if (!auth.hasRole(required)) {
    throw new AuthorizationError(
      `Decision override "${event.decision}" → "${to}" requires role "${required}" or higher — "${user.name}" is "${user.role}".`,
    );
  }
  return {
    event: {
      ...event,
      decision: to,
      decidedBy: user.id,
      reasonCodes: [...event.reasonCodes, `override:${event.decision}->${to}`],
    },
    overriddenBy: user.id,
    overriddenByRole: user.role,
    overriddenAtUtc: atUtc,
    previousDecision: event.decision,
  };
}
