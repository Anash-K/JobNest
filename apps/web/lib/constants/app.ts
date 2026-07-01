/** Application branding — UI only; package scopes remain @jobhunter/*. */
export const APP_NAME = 'JobNest';
export const APP_TAGLINE = 'Outreach CRM';
export const APP_LOGO_LETTERS = 'JN';

/** Session storage keys */
export const ACTIVE_BULK_SEND_KEY = 'jobnest:activeBulkSendId';

/** Auth routes — used by middleware and redirects */
export const AUTH_ROUTES = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

export const DEFAULT_APP_ROUTE = '/pipeline';

export const PUBLIC_AUTH_PATHS = Object.values(AUTH_ROUTES);

export function isAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
