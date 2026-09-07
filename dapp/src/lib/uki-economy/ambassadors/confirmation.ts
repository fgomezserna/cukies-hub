import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import { verifyWalletSignature } from '@/lib/wallet-auth';
import { stableAmbassadorHash } from './rules';

export const AMBASSADOR_CONFIRMATION_COOKIE = 'cukies_ambassador_confirmation';
const TTL_MS = 5 * 60 * 1_000;

export type AmbassadorConfirmationTarget =
  | { invitationCode: string }
  | { sponsor: 'cukies_world' };

type ConfirmationChallenge = {
  purpose: 'ambassador_confirmation_v1';
  wallet: string;
  sessionEvidenceHash: string;
  ambassadorWallet: string;
  target: AmbassadorConfirmationTarget;
  origin: string;
  chainId: number;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  message: string;
};

function secret() {
  const value = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new TypeError('AMBASSADOR_CONFIRMATION_SECRET_NOT_CONFIGURED');
  return value;
}

function seal(challenge: ConfirmationChallenge) {
  const body = Buffer.from(JSON.stringify(challenge)).toString('base64url');
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unseal(token: string | undefined): ConfirmationChallenge | null {
  if (!token || token.length > 8_192) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const receivedMac = Buffer.from(mac);
  const expectedMac = Buffer.from(expected);
  if (receivedMac.length !== expectedMac.length || !timingSafeEqual(receivedMac, expectedMac)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/economy/v1/ambassadors',
});

export function ambassadorConfirmationOrigin(request: Request) {
  return new URL(process.env.NEXTAUTH_URL || process.env.AUTH_URL || request.url).origin;
}

export async function createAmbassadorConfirmation(input: {
  wallet: string;
  sessionEvidenceHash: string;
  ambassadorWallet: string;
  target: AmbassadorConfirmationTarget;
  origin: string;
  chainId: number;
  now?: number;
}) {
  const issuedAt = input.now ?? Date.now();
  const expiresAt = issuedAt + TTL_MS;
  const nonce = randomBytes(24).toString('hex');
  const sponsor = 'sponsor' in input.target
    ? `Cukies World (${input.ambassadorWallet})`
    : input.ambassadorWallet;
  const message = [
    'Cukies World — Confirmación de embajador',
    '',
    `Sitio: ${input.origin}`,
    `Red: ${input.chainId}`,
    `Mi wallet: ${input.wallet}`,
    `Confirmo como embajador a: ${sponsor}`,
    ...('invitationCode' in input.target ? [`Invitación: ${input.target.invitationCode}`] : []),
    'Entiendo que esta relación es permanente y no podré cambiarla.',
    'Esta firma no envía una transacción ni requiere gas.',
    `Nonce: ${nonce}`,
    `Emitido: ${new Date(issuedAt).toISOString()}`,
    `Caduca: ${new Date(expiresAt).toISOString()}`,
  ].join('\n');
  const challenge: ConfirmationChallenge = {
    ...input,
    purpose: 'ambassador_confirmation_v1',
    issuedAt,
    expiresAt,
    nonce,
    message,
  };
  const cookieStore = await cookies();
  cookieStore.set(AMBASSADOR_CONFIRMATION_COOKIE, seal(challenge), {
    ...cookieOptions(), maxAge: TTL_MS / 1_000,
  });
  return { message, expiresAt: new Date(expiresAt).toISOString() };
}

export async function verifyAmbassadorConfirmation(input: {
  wallet: string;
  sessionEvidenceHash: string;
  ambassadorWallet: string;
  target: AmbassadorConfirmationTarget;
  origin: string;
  chainId: number;
  signature: string;
  now?: number;
}): Promise<string | null> {
  const cookieStore = await cookies();
  const challenge = unseal(cookieStore.get(AMBASSADOR_CONFIRMATION_COOKIE)?.value);
  const now = input.now ?? Date.now();
  if (
    !challenge || challenge.purpose !== 'ambassador_confirmation_v1'
    || challenge.wallet !== input.wallet
    || challenge.sessionEvidenceHash !== input.sessionEvidenceHash
    || challenge.ambassadorWallet !== input.ambassadorWallet
    || challenge.origin !== input.origin || challenge.chainId !== input.chainId
    || !Number.isFinite(challenge.issuedAt) || !Number.isFinite(challenge.expiresAt)
    || challenge.issuedAt > now || challenge.expiresAt <= now
    || challenge.expiresAt - challenge.issuedAt !== TTL_MS
    || stableAmbassadorHash(challenge.target) !== stableAmbassadorHash(input.target)
    || !/^0x[0-9a-f]+$/i.test(input.signature) || input.signature.length > 8_192
  ) return null;

  let verified = false;
  try {
    verified = await verifyWalletSignature({
      walletAddress: input.wallet,
      walletType: 'evm',
      message: challenge.message,
      signature: input.signature,
    });
  } catch {
    return null;
  }
  if (!verified) return null;
  return stableAmbassadorHash({ challenge, signature: input.signature });
}

export async function clearAmbassadorConfirmation() {
  const cookieStore = await cookies();
  cookieStore.set(AMBASSADOR_CONFIRMATION_COOKIE, '', {
    ...cookieOptions(), maxAge: 0,
  });
}
