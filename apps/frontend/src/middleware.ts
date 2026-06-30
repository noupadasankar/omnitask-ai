import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public paths that never require authentication
const PUBLIC_PREFIXES = ['/login', '/register', '/auth', '/_next', '/favicon.ico', '/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through public routes and Next.js internals
  if (pathname === '/' || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // `has_session` is a non-httpOnly flag cookie set by the auth store on login
  // and cleared on logout. It lets the middleware redirect before the JS bundle
  // loads, eliminating the unauthenticated flash of dashboard content.
  const hasSession = request.cookies.get('has_session')?.value === '1';
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
