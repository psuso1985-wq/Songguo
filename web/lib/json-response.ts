/** JSON bytes and their declared encoding must agree, including error responses. */
export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return Response.json(data, { ...init, headers });
}
