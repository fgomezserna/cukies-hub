import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
const envPath = join(__dirname, '..', '.env.local');
config({ path: envPath });

// Also try to load from .env if .env.local doesn't exist
config({ path: join(__dirname, '..', '.env') });

// Log the environment variables being used (without revealing sensitive info)
console.log('🔍 Environment check:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID ? 'Set' : 'Not set');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('Please create a .env.local file with your database connection string.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function initializeChatRooms() {
  try {
    console.log('🚀 Initializing chat rooms...');

    const rooms = [
      {
        gameId: 'sybil-slayer',
        name: 'Sybil Slayer Chat',
        description: 'Chat room for Sybil Slayer game players',
      },
      {
        gameId: 'hyppie-road',
        name: 'Hyppie Road Chat',
        description: 'Chat room for Hyppie Road game players',
      },
    ];

    for (const roomData of rooms) {
      const existingRoom = await prisma.chatRoom.findUnique({
        where: { gameId: roomData.gameId },
      });

      if (!existingRoom) {
        const room = await prisma.chatRoom.create({
          data: {
            gameId: roomData.gameId,
            name: roomData.name,
            description: roomData.description,
            telegramGroupId: process.env.TELEGRAM_CHAT_ID,
            // TODO: Create topics in Telegram and set telegramTopicId
          },
        });

        console.log(`✅ Created chat room: ${room.name} (${room.gameId})`);
      } else {
        console.log(`⚠️  Chat room already exists: ${existingRoom.name} (${existingRoom.gameId})`);
      }
    }

    console.log('🎉 Chat rooms initialization completed!');
  } catch (error) {
    console.error('❌ Error initializing chat rooms:', error);
  } finally {
    await prisma.$disconnect();
  }
}

initializeChatRooms();