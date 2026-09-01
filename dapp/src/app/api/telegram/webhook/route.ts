import { NextRequest, NextResponse } from 'next/server';
import { processTelegramMessage } from '@/lib/telegram-chat-utils';
import {
  consumeTelegramLinkChallenge,
  extractTelegramVerificationToken,
  isTelegramVerificationAttempt,
  isValidTelegramWebhookSecret,
  type TelegramLinkSender,
} from '@/lib/telegram-linking';

interface TelegramWebhookMessage {
  text?: unknown;
  from?: TelegramLinkSender;
  chat?: {
    id?: number | string;
    type?: string;
  };
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!isValidTelegramWebhookSecret(providedSecret, configuredSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const update = await request.json();
    const message = update?.message as TelegramWebhookMessage | undefined;

    if (message && isTelegramVerificationAttempt(message.text)) {
      const sender = message.from;
      const token = extractTelegramVerificationToken(message.text);
      const isPrivateSenderChat = Boolean(
        sender
          && message.chat?.type === 'private'
          && String(message.chat.id) === String(sender.id),
      );

      if (sender && token && isPrivateSenderChat) {
        await consumeTelegramLinkChallenge(token, sender);
      }

      // Verification commands are bearer material and never enter the chat bridge.
      return NextResponse.json({ ok: true });
    }

    if (message) {
      await processTelegramMessage(message as Parameters<typeof processTelegramMessage>[0]);
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Authenticated malformed updates are acknowledged without reflecting details.
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Telegram webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
