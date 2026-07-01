import { env, isProduction } from '../config/env';

export interface PasswordResetEmailPayload {
  email: string;
  url: string;
}

/**
 * Auth-related side effects (password reset delivery, etc.).
 * Keeps Better Auth configuration free of transport details.
 */
export class AuthService {
  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    if (isProduction) {
      // Production deployments must wire an email provider (SES, Resend, SendGrid, etc.).
      // Fail loudly so misconfiguration is caught before users attempt reset.
      throw new Error(
        'Password reset email delivery is not configured for production. ' +
          'Integrate an email provider in AuthService.sendPasswordResetEmail.',
      );
    }

    console.info('[auth] Password reset link (development)', {
      email: payload.email,
      resetUrl: payload.url,
      corsOrigin: env.CORS_ORIGIN,
    });
  }
}

export const authService = new AuthService();
