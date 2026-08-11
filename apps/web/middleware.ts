import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_APP_ROUTE } from '@/lib/constants/app';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(DEFAULT_APP_ROUTE, request.url));
  }

  // Authentication route protection is now handled exclusively by the client-side
  // AuthGuard and GuestGuard components to support cross-origin API sessions.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
