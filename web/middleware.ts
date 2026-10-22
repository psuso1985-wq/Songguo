import { NextRequest, NextResponse } from 'next/server';

// Public V1 has a closed entry-point list. Historical LAN routes use global
// service identities and must never become an alternate tenant-access path.
// Source-only public candidates remove the internal deployment bypass.
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicIntroduction = path === '/' || path === '/demo' || path.startsWith('/demo/') || path === '/pilot' || path.startsWith('/pilot/');
  if (isPublicIntroduction || path === '/workspace' || path.startsWith('/workspace/') || path.startsWith('/api/v1/') || path === '/api/version' || path.startsWith('/_next/') || path === '/icon.svg' || path === '/favicon.ico' || path === '/robots.txt') return NextResponse.next();
  if (path.startsWith('/api/') || path.startsWith('/storage/')) return NextResponse.json({ error: { code: 'not_found', message: '此入口不可用。' } }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const target = new URL('/workspace', request.url);
  return NextResponse.redirect(target);
}
export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
