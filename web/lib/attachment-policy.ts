import { createHash } from 'node:crypto';

// Shared between every upload path (the credential-resolved Agent's
// POST /api/agent-attachments and the Owner's browser upload on the Report
// detail page) so the two entry points enforce one policy, not two that can
// silently drift apart.

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// An allowlist, not a denylist: a format nobody asked for is refused by
// default rather than guessed to be safe. Every extension here is a format a
// Report attachment plausibly is -- a document, an image, a data export, a
// log, or a plain archive -- and none of them execute when opened by a
// standard viewer.
//
// html/htm were refused here until 2026-09-02. They are allowed now because
// the download route (web/app/api/agent-attachments/[id]/route.ts) already
// forces `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`
// and a safe `Content-Type` (never text/html) for every attachment
// regardless of its stored mimetype -- that guarantee was already true
// before this change and does not depend on the upload-time extension check.
// Refusing HTML at upload time never added protection; it only hid an Agent's
// key deliverable (a self-contained management-report HTML file) from the
// Report and its progress timeline. svg stays refused: unlike a downloaded
// HTML file, an svg can be opened by a browser tab a user drags it into and
// execute inline script there -- a materially different risk, not covered by
// the download route's forced disposition.
export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  'pdf', 'txt', 'md', 'csv', 'json', 'log', 'html', 'htm',
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip',
]);

// Extensions that a browser or shell may treat as executable or as script
// content, checked at every position in the filename -- not only the last
// one. `report.pdf.exe` must be refused for the same reason `report.exe` is:
// a client that only glances at the leading "pdf" would open it expecting a
// document.
const DANGEROUS_EXTENSION_PATTERN = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|jar|sh|bash|dll|sys|svg|php\d?|py|reg|lnk|scf|hta|application|gadget)(\.|$)/i;

export class AttachmentPolicyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AttachmentPolicyError';
    this.status = status;
  }
}

function extension(filename: string) {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

// Exported so an upload route can decide -- without re-deriving its own copy
// of "what counts as HTML" -- whether a just-validated filename needs the
// read-only scan below, and so the Work Management timeline can classify an
// already-stored attachment the same way (spec: html/pdf -> report,
// image -> evidence, everything else -> file).
export function fileExtension(filename: string) {
  return extension(filename);
}

export function isHtmlFilename(filename: string) {
  const ext = extension(filename);
  return ext === 'html' || ext === 'htm';
}

export type AttachmentKind = 'report' | 'evidence' | 'file';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

export function attachmentKind(filename: string): AttachmentKind {
  const ext = extension(filename);
  if (ext === 'html' || ext === 'htm' || ext === 'pdf') return 'report';
  if (IMAGE_EXTENSIONS.has(ext)) return 'evidence';
  return 'file';
}

export type HtmlScan = { scripts: number; external_refs: number; forms: number; iframes: number };

// A read-only static scan, never a reason to refuse the upload (spec: "不据此
// 拒收"). It exists so the Report page and the Owner can see at a glance
// whether a downloaded HTML file is truly self-contained (the 42-style
// management report: inline style, zero external references, no script
// beyond a small local popup) or actually reaches out to the network when
// opened -- something a bare filename and size cannot tell them.
//
// Intentionally not a full HTML parser: counting tag/attribute occurrences by
// regex is enough to answer "roughly how many, of what kind" for a human
// reader, and it never has to trust or execute the scanned content.
function count(source: string, pattern: RegExp) {
  return (source.match(pattern) || []).length;
}

// Matches src="http://..." / href="https://..." / src="//cdn..." -- an
// absolute or protocol-relative external reference. A same-document anchor
// (#id), a relative path, or a data: URI never matches.
const EXTERNAL_REFERENCE_PATTERN = /\b(?:src|href)\s*=\s*(["'])(?:https?:)?\/\/[^"']+\1/gi;

export function scanHtml(source: string): HtmlScan {
  return {
    scripts: count(source, /<script\b/gi),
    external_refs: count(source, EXTERNAL_REFERENCE_PATTERN),
    forms: count(source, /<form\b/gi),
    iframes: count(source, /<iframe\b/gi),
  };
}

/**
 * Reject a filename before it is ever handed to storage.
 *
 * Three independent checks, because any one alone is bypassable: a bare
 * separator blocks path traversal, the dangerous-extension scan blocks a
 * double-extension disguise at any position (not only the last), and the
 * allowlist blocks every format this route was never meant to accept.
 */
export function assertSafeFilename(filename: string) {
  const name = (filename || '').trim();
  if (!name) throw new AttachmentPolicyError('A filename is required.');
  if (name.length > 255) throw new AttachmentPolicyError('The filename is too long.');
  // No path component may travel with the name: '/', '\\', a leading '.', or
  // a NUL byte are all ways a stored filename could be made to resolve
  // outside the upload directory or hide its real extension from a reader.
  if (/[/\\]/.test(name) || name.includes('\0') || name === '.' || name === '..') {
    throw new AttachmentPolicyError('The filename must not contain a path.');
  }
  if (DANGEROUS_EXTENSION_PATTERN.test(name)) {
    throw new AttachmentPolicyError('This file type is not accepted.');
  }
  const ext = extension(name);
  if (!ext || !ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
    throw new AttachmentPolicyError('This file type is not accepted.');
  }
  return name;
}

export function assertSafeSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new AttachmentPolicyError('The uploaded file is empty.');
  if (size > MAX_ATTACHMENT_BYTES) throw new AttachmentPolicyError('The uploaded file exceeds the 25 MB limit.', 413);
}

export async function sha256Hex(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash('sha256').update(buffer).digest('hex');
}
