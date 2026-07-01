import { NextResponse, type NextRequest } from 'next/server';
import {
  AUTH_ROUTES,
  DEFAULT_APP_ROUTE,
  isAuthPath,
} from '@/lib/constants/app';

const AUTH_BASE_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:4000';

async function hasSession(request: NextRequest): Promise<boolean> {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/api/v1/auth/get-session`, {
      headers: {
        cookie: request.headers.get('cookie') ?? '',
      },
      cache: 'no-store',
    });

    if (!response.ok) return false;

    const data = (await response.json()) as { user?: unknown };
    return Boolean(data?.user);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const authenticated = await hasSession(request);
  const isAuthRoute = isAuthPath(pathname);

  if (pathname === '/') {
    const destination = authenticated ? DEFAULT_APP_ROUTE : AUTH_ROUTES.login;
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (!authenticated && !isAuthRoute) {
    const loginUrl = new URL(AUTH_ROUTES.login, request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && isAuthRoute) {
    return NextResponse.redirect(new URL(DEFAULT_APP_ROUTE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
