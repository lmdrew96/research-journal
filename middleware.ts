import { next } from '@vercel/edge';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/api/login'];

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);

  // Allow public paths and static assets
  if (PUBLIC_PATHS.some(p => url.pathname.startsWith(p))) {
    return next();
  }

  // Check session cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const token = parseCookie(cookieHeader, 'rj-session');

  if (!token) {
    return Response.redirect(new URL('/login', request.url));
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return Response.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return next();
  } catch {
    // Invalid or expired token
    return Response.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!assets/|_next/static|_next/image|favicon\\.ico|.*\\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)'],
};