import { createHash, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

const TELEGRAM_VERIFY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TELEGRAM_VERIFY_TOKEN_IN_TEXT_PATTERN = /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?:$|[^A-Za-z0-9_-])/;
const TELEGRAM_VERIFY_COMMAND_PATTERN = /^\/verify ([A-Za-z0-9_-]{43})$/;
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['creator', 'administrator', 'member']);

export interface TelegramLinkSender {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMembershipResponse {
  ok?: boolean;
  result?: {
    status?: string;
    is_member?: boolean;
    user?: { id?: number | string };
  };
}

export interface TelegramLinkResult {
  linked: boolean;
}

export function hashTelegramVerificationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isValidTelegramWebhookSecret(
  providedSecret: string | null,
  configuredSecret: string,
): boolean {
  if (!providedSecret || !configuredSecret) {
    return false;
  }

  // Hash both values first so timingSafeEqual always receives fixed-size buffers.
  const providedDigest = createHash('sha256').update(providedSecret, 'utf8').digest();
  const configuredDigest = createHash('sha256').update(configuredSecret, 'utf8').digest();
  return timingSafeEqual(providedDigest, configuredDigest);
}

export function isTelegramVerificationAttempt(text: unknown): boolean {
  if (typeof text !== 'string') {
    return false;
  }

  // Suppress malformed/quoted commands and bare challenge tokens as well. This
  // keeps bearer material out of both bridge logs and persisted chat messages.
  return text.toLowerCase().includes('/verify')
    || TELEGRAM_VERIFY_TOKEN_IN_TEXT_PATTERN.test(text);
}

export function extractTelegramVerificationToken(text: unknown): string | null {
  if (typeof text !== 'string') {
    return null;
  }

  return TELEGRAM_VERIFY_COMMAND_PATTERN.exec(text.trimStart())?.[1] ?? null;
}

function normalizeTelegramUserId(value: number | string): string | null {
  const normalized = String(value);
  return /^\d{1,20}$/.test(normalized) ? normalized : null;
}

function telegramDisplayName(sender: TelegramLinkSender): string | null {
  const displayName = [sender.first_name, sender.last_name]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(' ');

  return displayName || null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'P2002',
  );
}

async function isActiveTelegramGroupMember(
  telegramUserId: string,
  botToken: string,
  chatId: string,
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        user_id: telegramUserId,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json() as TelegramMembershipResponse;
    const status = payload.result?.status;
    const returnedUserId = payload.result?.user?.id;
    if (!payload.ok || !status || returnedUserId === undefined) {
      return false;
    }

    if (normalizeTelegramUserId(returnedUserId) !== telegramUserId) {
      return false;
    }

    return ACTIVE_MEMBERSHIP_STATUSES.has(status)
      || (status === 'restricted' && payload.result?.is_member === true);
  } catch {
    return false;
  }
}

export async function consumeTelegramLinkChallenge(
  token: string,
  sender: TelegramLinkSender,
  now = new Date(),
): Promise<TelegramLinkResult> {
  if (!TELEGRAM_VERIFY_TOKEN_PATTERN.test(token)) {
    return { linked: false };
  }

  const telegramUserId = normalizeTelegramUserId(sender.id);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!telegramUserId || !botToken || !chatId) {
    return { linked: false };
  }

  if (!await isActiveTelegramGroupMember(telegramUserId, botToken, chatId)) {
    return { linked: false };
  }

  const tokenHash = hashTelegramVerificationToken(token);
  const username = sender.username?.trim() || null;
  const displayName = telegramDisplayName(sender);

  try {
    const linked = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const challenge = await tx.telegramLinkChallenge.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          consumedAt: true,
        },
      });

      if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) {
        return false;
      }

      const linkForTelegramAccount = await tx.telegramAccountLink.findUnique({
        where: { telegramUserId },
        select: { userId: true },
      });
      if (linkForTelegramAccount && linkForTelegramAccount.userId !== challenge.userId) {
        return false;
      }

      const linkForUser = await tx.telegramAccountLink.findUnique({
        where: { userId: challenge.userId },
        select: { telegramUserId: true },
      });
      if (linkForUser && linkForUser.telegramUserId !== telegramUserId) {
        return false;
      }

      const claim = await tx.telegramLinkChallenge.updateMany({
        where: {
          id: challenge.id,
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          consumedAt: now,
          consumedTelegramUserId: telegramUserId,
          consumedTelegramUsername: username,
          consumedTelegramDisplay: displayName,
        },
      });
      if (claim.count !== 1) {
        return false;
      }

      await tx.telegramAccountLink.upsert({
        where: { userId: challenge.userId },
        create: {
          userId: challenge.userId,
          telegramUserId,
          username,
          displayName,
        },
        update: {
          username,
          displayName,
        },
      });

      await tx.user.update({
        where: { id: challenge.userId },
        data: { telegramUsername: username ?? displayName },
      });

      return true;
    });

    return { linked };
  } catch (error) {
    // Unique conflicts and transaction races deliberately collapse to the same result.
    if (isUniqueConstraintError(error)) {
      return { linked: false };
    }
    return { linked: false };
  }
}
