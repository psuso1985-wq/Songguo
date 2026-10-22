// Content-Disposition for a downloaded attachment (RFC 6266 / RFC 5987).
//
// A Content-Disposition value is an HTTP header value, and the Fetch/Headers
// contract restricts a header value to ISO-8859-1 -- undici (the fetch/
// Response implementation Next.js runs on) enforces this by throwing rather
// than silently mangling the bytes. GET /api/agent-attachments/{id} used to
// interpolate a stored filename directly into the header string; the moment
// that filename contained a non-Latin-1 character (Chinese, Japanese,
// emoji, ...) the `new Response(...)` call threw, and the route's
// catch-all turned that thrown error into the same 502 "The stored file
// could not be read" a genuinely missing file would produce -- even though
// the file itself was read from storage without any problem.
//
// The fix is the header pair RFC 6266 defines for exactly this split: a
// quoted, ASCII-only `filename=` fallback for a client that only understands
// the legacy form, and `filename*=UTF-8''<percent-encoded>` carrying the
// real name, decoded by every modern browser. Encoding is via
// `encodeURIComponent`, tightened to also escape the handful of characters
// (`! ' ( ) *`) it leaves unencoded but RFC 5987's `attr-char` does not
// allow -- the same tightening the `content-disposition` npm package applies.

const PRINTABLE_ASCII_NO_QUOTE_OR_BACKSLASH = /^[\x20-\x21\x23-\x5b\x5d-\x7e]*$/;

function asciiFallbackFilename(filename: string): string {
  // Printable ASCII only; a literal double quote or backslash would need
  // backslash-escaping inside the quoted-string this becomes, so both are
  // simply replaced with '_' instead -- the fallback name a legacy client
  // sees is never decorated with escapes it never asked for. Every other
  // non-ASCII byte (the common case: Chinese/Japanese/Korean/emoji) is '_'
  // for the same reason.
  const safe = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_').trim();
  return safe || 'attachment';
}

function encodeExtValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

/** Builds a full `Content-Disposition: attachment; ...` header value for the given stored filename. */
export function contentDispositionHeader(filename: string): string {
  const raw = (filename || '').trim() || 'attachment';
  const fallback = asciiFallbackFilename(raw);
  const header = 'attachment; filename="' + fallback + '"';
  // The extended filename* form is only added when it would carry more
  // information than the fallback already does -- a plain-ASCII filename
  // with no quote/backslash round-trips through asciiFallbackFilename
  // unchanged, so the extra parameter would be redundant.
  if (raw === fallback && PRINTABLE_ASCII_NO_QUOTE_OR_BACKSLASH.test(raw)) return header;
  return header + "; filename*=UTF-8''" + encodeExtValue(raw);
}
