// The one place a canonical Owner-facing AIsys address is decided.
//
// It is read from server configuration and never from the request. Deriving it
// from the `Host` header would let whoever calls the API choose the address
// that is then handed back as an official page link, so a receipt could be made
// to point at an attacker-controlled host while still looking verified.
//
// Configuration is required rather than optional: a Project write that cannot
// produce a real page link is an incomplete receipt, and a fabricated link is
// worse than a failed write. Missing or invalid configuration therefore fails
// closed at the API boundary instead of degrading silently.
export const PUBLIC_BASE_URL_VARIABLE = 'AISYS_PUBLIC_BASE_URL';

export class PublicBaseUrlError extends Error {
  constructor(reason: string) {
    super(PUBLIC_BASE_URL_VARIABLE + ' ' + reason);
    this.name = 'PublicBaseUrlError';
  }
}

// HTTP is allowed only for a loopback test environment. Any other host must be
// HTTPS: an Agent credential and an Owner-facing link both travel that address.
function assertTransport(url: URL) {
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return;
  throw new PublicBaseUrlError('must be an absolute https:// URL (http:// is accepted only for localhost or 127.0.0.1).');
}

export function publicBaseUrl(value = process.env[PUBLIC_BASE_URL_VARIABLE]) {
  const configured = (value || '').trim();
  if (!configured) throw new PublicBaseUrlError('is not configured.');
  let url: URL;
  try { url = new URL(configured); } catch { throw new PublicBaseUrlError('must be an absolute URL.'); }
  assertTransport(url);
  // A credential, a query or a fragment in the base address would be copied
  // into every published link, so the base is restricted to origin plus an
  // optional path prefix.
  if (url.username || url.password) throw new PublicBaseUrlError('must not embed credentials.');
  if (url.search || url.hash) throw new PublicBaseUrlError('must not include a query string or fragment.');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export function canonicalProjectUrl(projectKey: string, value = process.env[PUBLIC_BASE_URL_VARIABLE]) {
  const key = (projectKey || '').trim();
  if (!key) throw new PublicBaseUrlError('cannot build a canonical Project link without a project_key.');
  return publicBaseUrl(value) + '/work-management?project_key=' + encodeURIComponent(key);
}

// A Project Report never had its own page before this: the only receipt a
// caller got back was a JSON id, which is not something a person can open. A
// Report id is a positive integer path segment, not a caller-chosen key, so
// this only guards against a non-numeric or non-positive value reaching the
// link -- it does not re-derive the id from anything the caller supplied.
export function canonicalReportUrl(reportId: string | number, value = process.env[PUBLIC_BASE_URL_VARIABLE]) {
  const id = String(reportId ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(id)) throw new PublicBaseUrlError('cannot build a canonical Report link without a positive integer id.');
  return publicBaseUrl(value) + '/project-reports/' + id;
}
