import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getCookieName } from '@/lib/auth';

// Routes that don't require authentication
const publicPaths = ['/login', '/register'];
const publicApiPrefixes = ['/api/auth/'];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow public API routes
  if (publicApiPrefixes.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // static files
  ) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get(getCookieName())?.value;

  if (!token) {
    // Redirect to login for page requests
    if (!pathname.startsWith('/api/')) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    // Return 401 for API requests
    return NextResponse.json(
      { error: 'Oturum açmanız gerekiyor.' },
      { status: 401 },
    );
  }

  // Verify token
  const payload = await verifyToken(token);

  if (!payload) {
    // Clear invalid token and redirect
    if (!pathname.startsWith('/api/')) {
      const loginUrl = new URL('/login', request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set(getCookieName(), '', { maxAge: 0, path: '/' });
      return response;
    }
    return NextResponse.json(
      { error: 'Geçersiz oturum. Lütfen tekrar giriş yapın.' },
      { status: 401 },
    );
  }

  // Add user info to request headers for API routes to use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-username', payload.username);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
