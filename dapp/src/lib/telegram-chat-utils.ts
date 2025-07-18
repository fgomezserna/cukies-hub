import { prisma } from '@/lib/prisma';

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
  message_thread_id?: number;
  reply_to_message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
  };
}

export interface TelegramSendMessageResponse {
  ok: boolean;
  result?: {
    message_id: number;
    date: number;
  };
  error_code?: number;
  description?: string;
}

export async function sendMessageToTelegram(
  roomId: string,
  content: string,
  replyToTelegramMessageId?: number
): Promise<TelegramSendMessageResponse> {
  try {
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room || !room.telegramGroupId || !process.env.TELEGRAM_BOT_TOKEN) {
      return { ok: false, error_code: 404, description: 'Room or Telegram configuration not found' };
    }

    const payload: any = {
      chat_id: room.telegramGroupId,
      text: content,
      parse_mode: 'HTML',
    };

    // Add topic threading if available
    if (room.telegramTopicId) {
      payload.message_thread_id = room.telegramTopicId;
    }

    // Add reply if specified
    if (replyToTelegramMessageId) {
      payload.reply_to_message_id = replyToTelegramMessageId;
    }

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
    return { ok: false, error_code: 500, description: 'Internal server error' };
  }
}

export async function processTelegramMessage(telegramMessage: TelegramMessage): Promise<void> {
  try {
    if (!telegramMessage.text) {
      return; // Skip non-text messages for now
    }

    // Find the chat room by Telegram group ID and topic ID
    const room = await prisma.chatRoom.findFirst({
      where: {
        telegramGroupId: telegramMessage.chat.id.toString(),
        ...(telegramMessage.message_thread_id && {
          telegramTopicId: telegramMessage.message_thread_id,
        }),
      },
    });

    if (!room) {
      console.log('No chat room found for Telegram message');
      return;
    }

    // Check if this message already exists
    const existingMessage = await prisma.chatMessage.findFirst({
      where: {
        telegramMessageId: telegramMessage.message_id,
        roomId: room.id,
      },
    });

    if (existingMessage) {
      console.log('Message already processed');
      return;
    }

    // Try to find if this Telegram user is registered in our system
    const user = await prisma.user.findFirst({
      where: {
        telegramUsername: telegramMessage.from.username,
      },
    });

    // Handle reply
    let replyToId: string | undefined;
    if (telegramMessage.reply_to_message) {
      const originalMessage = await prisma.chatMessage.findFirst({
        where: {
          telegramMessageId: telegramMessage.reply_to_message.message_id,
          roomId: room.id,
        },
      });
      replyToId = originalMessage?.id;
    }

    // Create the message in our database
    await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        content: telegramMessage.text,
        messageType: 'TEXT',
        userId: user?.id,
        telegramUserId: telegramMessage.from.id,
        telegramUsername: telegramMessage.from.username,
        telegramFirstName: telegramMessage.from.first_name,
        telegramLastName: telegramMessage.from.last_name,
        telegramMessageId: telegramMessage.message_id,
        isFromTelegram: true,
        replyToId,
      },
    });

    console.log('Processed Telegram message:', telegramMessage.message_id);
  } catch (error) {
    console.error('Error processing Telegram message:', error);
  }
}

export async function createGameChatRooms(): Promise<void> {
  try {
    const games = [
      {
        gameId: 'sybil-slayer',
        name: 'Sybil Slayer Chat',
        description: 'Chat for Sybil Slayer game players',
      },
      {
        gameId: 'hyppie-road',
        name: 'Hyppie Road Chat',
        description: 'Chat for Hyppie Road game players',
      },
    ];

    for (const game of games) {
      const existingRoom = await prisma.chatRoom.findUnique({
        where: { gameId: game.gameId },
      });

      if (!existingRoom) {
        await prisma.chatRoom.create({
          data: {
            gameId: game.gameId,
            name: game.name,
            description: game.description,
            telegramGroupId: process.env.TELEGRAM_CHAT_ID,
            // TODO: Create topics in Telegram and set telegramTopicId
          },
        });
        console.log(`Created chat room for ${game.gameId}`);
      }
    }
  } catch (error) {
    console.error('Error creating game chat rooms:', error);
  }
}

export async function getTelegramUpdates(offset?: number): Promise<TelegramMessage[]> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return [];
    }

    const url = new URL(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
    if (offset) {
      url.searchParams.set('offset', offset.toString());
    }

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!data.ok) {
      console.error('Error fetching Telegram updates:', data);
      return [];
    }

    return data.result
      .filter((update: any) => update.message)
      .map((update: any) => update.message);
  } catch (error) {
    console.error('Error getting Telegram updates:', error);
    return [];
  }
}