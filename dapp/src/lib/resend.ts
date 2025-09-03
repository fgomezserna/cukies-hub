import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const EMAIL_CONFIG = {
  from: process.env.RESEND_FROM_EMAIL || 'noreply@hyppie.com',
  domain: process.env.RESEND_DOMAIN || 'hyppie.com'
} as const;
