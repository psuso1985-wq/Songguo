import { createHmac, timingSafeEqual } from 'node:crypto';

// A credential token is `<credential_key>.<secret>`.
//
// The lookup key travels with the token so verification is a single indexed
// read followed by one comparison. Without it, every request would have to be
// checked against every stored credential.
export const CREDENTIAL_TOKEN_SEPARATOR = '.';

export type CredentialRow = {
  id?: unknown;
  credential_key?: unknown;
  token_hash?: unknown;
  status?: unknown;
  expires_at?: unknown;
  agent_id?: unknown;
};

export type CredentialCheck =
  | { ok: true; credentialKey: string; agentId: unknown }
  | { ok: false };

/**
 * HMAC-SHA256 of the secret, keyed with a server-held pepper.
 *
 * The Owner chose HMAC over a password hash (argon2/bcrypt): a credential
 * secret is a high-entropy generated value, not a human-chosen password, so
 * the work factor that protects weak passwords buys nothing here, while the
 * per-request cost would be paid on every write.
 *
 * The pepper means a leaked database alone does not permit offline verification
 * of guessed secrets -- the server key is required too.
 */
export function hashSecret(secret: string, pepper: string) {
  return createHmac('sha256', pepper).update(secret).digest('hex');
}

export function splitCredentialToken(token: string) {
  // Split on the FIRST separator: the key never contains one, while a secret
  // generated as base64/base64url legitimately can.
  const index = token.indexOf(CREDENTIAL_TOKEN_SEPARATOR);
  if (index <= 0 || index === token.length - 1) return null;
  return {
    credentialKey: token.slice(0, index),
    secret: token.slice(index + 1),
  };
}

function constantTimeEquals(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isExpired(expiresAt: unknown, now: Date) {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') return false;
  const timestamp = Date.parse(String(expiresAt));
  // An unparseable expiry is treated as expired rather than ignored: failing
  // closed on malformed data is the safe direction for a credential check.
  if (Number.isNaN(timestamp)) return true;
  return timestamp <= now.getTime();
}

/**
 * Decide whether a presented secret authenticates the given credential row.
 *
 * Every rejection is indistinguishable to the caller -- the route returns one
 * fixed 401 for "no such credential", "revoked", "expired" and "wrong secret"
 * alike, so responses cannot be used to enumerate valid credential keys.
 */
export function verifyCredential(
  row: CredentialRow | null,
  secret: string,
  pepper: string,
  now: Date = new Date(),
): CredentialCheck {
  if (!row) return { ok: false };
  if (String(row.status ?? '') !== 'ACTIVE') return { ok: false };
  if (isExpired(row.expires_at, now)) return { ok: false };
  if (!constantTimeEquals(hashSecret(secret, pepper), String(row.token_hash ?? ''))) return { ok: false };
  if (row.agent_id === null || row.agent_id === undefined) return { ok: false };
  return { ok: true, credentialKey: String(row.credential_key ?? ''), agentId: row.agent_id };
}
