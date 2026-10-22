import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { publicBaseUrl } from '../public-base-url';
import { OwnerAuthError } from './errors';

export const SESSION_COOKIE = '__Secure-aisys_owner_session';
export const SESSION_SECONDS = 8 * 60 * 60;
// Scoped to /api (not just /api/owner-session) because every
// /api/settings/* Owner-guarded route reads this same cookie through
// requireOwner() -- see auth.ts.
const COOKIE_SCOPE = 'Path=/api; HttpOnly; Secure; SameSite=Strict';
const AAD = Buffer.from('aisys:owner-auth:owner-session:v1');
export const MAX_OWNER_TOKEN_LENGTH = 2048;
const authRequired = () => new OwnerAuthError('owner_auth_required', 'Owner authorization is required.', 401);
const unavailable = () => new OwnerAuthError('owner_session_unavailable', 'Owner sign-in is temporarily unavailable.', 503);

// No default, auto-generated, environment-string or repository key. Read again
// for every operation so removing or rotating the protected file takes effect.
export async function sessionKey(path = process.env.AISYS_OWNER_SESSION_KEY_FILE || ''): Promise<Buffer> {
  if (!isAbsolute(path)) throw unavailable();
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw unavailable();
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== 32 || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) throw unavailable();
      const key = await file.readFile();
      if (key.length !== 32) throw unavailable();
      return key;
    } finally { await file.close(); }
  } catch { throw unavailable(); }
}

export function assertSessionOrigin(request: Request): void {
  let expected: string;
  try { expected = new URL(publicBaseUrl()).origin; } catch { throw unavailable(); }
  const site = request.headers.get('sec-fetch-site');
  if (request.headers.get('origin') !== expected || (site && site !== 'same-origin')) {
    throw new OwnerAuthError('owner_origin_rejected', 'This sign-in or change must originate from AIsys.', 403);
  }
}

export function validOwnerToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_OWNER_TOKEN_LENGTH && /^[A-Za-z0-9._~+\/-]+=*$/.test(value);
}

export async function createSessionCookie(token: string, now = Date.now()): Promise<string> {
  if (!validOwnerToken(token)) throw unavailable();
  const key = await sessionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ token, issuedAt: now, expiresAt: now + SESSION_SECONDS * 1000 }), 'utf8'), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  return `${SESSION_COOKIE}=${value}; ${COOKIE_SCOPE}; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${COOKIE_SCOPE}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function readSessionToken(request: Request, now = Date.now()): Promise<string> {
  const cookies = (request.headers.get('cookie') || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (cookies.length !== 1) throw authRequired();
  const value = cookies[0].slice(SESSION_COOKIE.length + 1);
  if (!/^[A-Za-z0-9_-]{40,4000}$/.test(value)) throw authRequired();
  const key = await sessionKey();
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAAD(AAD);
    decipher.setAuthTag(raw.subarray(12, 28));
    const data = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    if (!validOwnerToken(data.token) || !Number.isSafeInteger(data.issuedAt) || !Number.isSafeInteger(data.expiresAt)
      || data.issuedAt > now || data.expiresAt <= now || data.expiresAt - data.issuedAt !== SESSION_SECONDS * 1000) throw authRequired();
    return data.token;
  } catch { throw authRequired(); }
}

export async function loginBody(request: Request): Promise<{ account: string; password: string }> {
  const invalid = () => new OwnerAuthError('invalid_login', 'Enter a valid account and password.', 400);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    || Number(request.headers.get('content-length')) > 8192 || !request.body) throw invalid();
  const reader = request.body.getReader();
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); throw invalid(); }
      parts.push(value);
    }
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['account', 'password'].includes(key))
      || typeof body.account !== 'string' || !body.account.trim() || body.account.length > 256 || /[\x00-\x1f\x7f]/.test(body.account)
      || typeof body.password !== 'string' || !body.password || body.password.length > 1024) throw invalid();
    return { account: body.account.trim(), password: body.password };
  } catch { throw invalid(); } finally { reader.releaseLock(); }
}
