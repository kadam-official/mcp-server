/**
 * What the session's bearer may do on the Kadam API. Resolved once per session from
 * `GET /access` and used only to shape the catalog: tools and campaign fields that a
 * plain client token would get 403 / 422 on are not registered for it. The API stays
 * the gate — this never grants anything the bearer does not already have.
 *
 * There are exactly two roles upstream: a client (own API key, or a JWT with `sub`
 * only) and a Kadam manager impersonating the client (JWT with `act.sub`).
 */
export interface SessionAccess {
  readonly impersonation: boolean;
}

/** The default when the role is unknown: the smaller catalog is always safe to show. */
export const CLIENT_ACCESS: SessionAccess = Object.freeze({ impersonation: false });

export const IMPERSONATION_ACCESS: SessionAccess = Object.freeze({ impersonation: true });

/** Catalog requirement a tool may declare; absent = available to every session. */
export type AccessRequirement = "impersonation";

export function satisfiesRequirement(
  access: SessionAccess,
  requirement: AccessRequirement | undefined,
): boolean {
  if (requirement === undefined) return true;
  return access.impersonation;
}
