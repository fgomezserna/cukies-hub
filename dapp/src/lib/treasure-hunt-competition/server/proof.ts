import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CheckpointReceiptPayload {
  readonly version: 1;
  readonly campaignId: string;
  readonly attemptId: string;
  readonly walletAddress: string;
  readonly gameSessionId: string;
  readonly nextSequence: number;
  readonly previousDigest: string;
  readonly expiresAt: string;
}

function signatureFor(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isPayload(value: unknown): value is CheckpointReceiptPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === 1 &&
    typeof payload.campaignId === 'string' && payload.campaignId.length > 0 &&
    typeof payload.attemptId === 'string' && payload.attemptId.length > 0 &&
    typeof payload.walletAddress === 'string' && payload.walletAddress.length > 0 &&
    typeof payload.gameSessionId === 'string' && payload.gameSessionId.length > 0 &&
    Number.isSafeInteger(payload.nextSequence) && Number(payload.nextSequence) >= 0 &&
    typeof payload.previousDigest === 'string' && payload.previousDigest.length > 0 &&
    typeof payload.expiresAt === 'string' && Number.isFinite(Date.parse(payload.expiresAt))
  );
}

export function createCheckpointReceipt(payload: CheckpointReceiptPayload, secret: string) {
  if (!secret) throw new Error('Checkpoint receipt secret is required');
  if (!isPayload(payload)) throw new Error('Invalid checkpoint receipt payload');

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${signatureFor(body, secret)}`;
}

export function verifyCheckpointReceiptSignature(
  receipt: string,
  secret: string,
): CheckpointReceiptPayload | null {
  const parts = receipt.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !secret) return null;
  const [body, signature] = parts;
  if (!safeEqual(signature, signatureFor(body, secret))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    if (!isPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyCheckpointReceipt(
  receipt: string,
  secret: string,
  now = new Date(),
): CheckpointReceiptPayload | null {
  const parsed = verifyCheckpointReceiptSignature(receipt, secret);
  if (!parsed || now.getTime() > Date.parse(parsed.expiresAt)) return null;
  return parsed;
}
