/**
 * Auth / RBAC adapter for gate-decision overrides.
 *
 * Phase C — "minimum necessary": this demo has no users, no sessions, no
 * server. The `AuthProvider` interface is the seam where a real identity
 * provider would plug in; `DevMockAuthProvider` is a clearly-labeled
 * stand-in used only so the override rule (manual-review → authorized
 * requires `supervisor`) is executable and testable.
 *
 * WHAT A REAL PROVIDER MUST IMPLEMENT (documentation, not code):
 * - `getCurrentUser()` must be backed by a server-verified session (signed
 *   token / session cookie validated server-side), never by a client-side
 *   localStorage flag the visitor can edit in devtools.
 * - Roles must be assigned server-side (IdP groups / TOS directory), not
 *   chosen by the client.
 * - Every override decision must be written to the server-side audit trail
 *   with the verified identity; the client-side audit store in audit.ts is
 *   demo-only and tamperable.
 * - Sessions must expire and be revocable; failed authorization attempts
 *   should be rate-limited and logged.
 *
 * Role hierarchy (least → most privileged): viewer < operator < supervisor < admin.
 */

export type Role = 'viewer' | 'operator' | 'supervisor' | 'admin';

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  supervisor: 2,
  admin: 3,
};

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
};

export interface AuthProvider {
  /** The currently signed-in user (dev: whoever the mock was built with). */
  getCurrentUser(): AuthUser;
  /** True when the current user's rank meets or exceeds `role`. */
  hasRole(role: Role): boolean;
  /** Throws AuthorizationError when the current user lacks `role`. */
  requireRole(role: Role): void;
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Dev-only mock auth provider. Labeled loudly wherever it is used: it
 * trusts whatever role it was constructed with, which is exactly why it
 * must never reach production.
 */
export class DevMockAuthProvider implements AuthProvider {
  /** Present on every instance so UI/logs can show the DEMO banner. */
  static readonly IS_DEV_MOCK = true as const;

  private readonly user: AuthUser;

  constructor(role: Role, name = 'Dev Operator') {
    this.user = { id: `dev-${role}`, name, role };
  }

  getCurrentUser(): AuthUser {
    return this.user;
  }

  hasRole(role: Role): boolean {
    return ROLE_RANK[this.user.role] >= ROLE_RANK[role];
  }

  requireRole(role: Role): void {
    if (!this.hasRole(role)) {
      throw new AuthorizationError(
        `Requires role "${role}" or higher — current dev role is "${this.user.role}".`,
      );
    }
  }
}

/**
 * Which role is allowed to move a gate decision from `from` to `to`.
 *
 * - manual-review → authorized: SUPERVISOR or above. This is the safety
 *   gate: only a supervisor may overrule the automation's caution.
 * - denied → authorized: SUPERVISOR or above (denials are identifier
 *   mismatches or cancelled appointments — never an operator call).
 * - anything → denied: OPERATOR or above (escalating to denial is safe).
 * - manual-review → manual-review / review bookkeeping: OPERATOR or above.
 */
export function requiredRoleForOverride(
  from: 'authorized' | 'manual-review' | 'denied',
  to: 'authorized' | 'manual-review' | 'denied',
): Role {
  if (to === 'authorized' && from !== 'authorized') return 'supervisor';
  if (to === 'denied') return 'operator';
  return 'operator';
}
