import { Resend } from 'resend';

export function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is required');
  }

  return new Resend(process.env.RESEND_API_KEY);
}

export const EMAIL_CONFIG = {
  from: process.env.RESEND_FROM_EMAIL || 'noreply@hyppie.com',
  domain: process.env.RESEND_DOMAIN || 'hyppie.com'
} as const;
