import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function initializeChatRooms() {
  try {
    console.log('🚀 Initializing chat rooms...');

    const rooms = [
      {
        gameId: 'sybil-slayer',
        name: 'Treasure Hunt Chat',
        description: 'Chat room for Treasure Hunt players',
      },
      {
        gameId: 'hyppie-road',
        name: 'Hyppie Road Chat',
        description: 'Chat room for Hyppie Road game players',
      },
      {
        gameId: 'tower-builder',
        name: 'Tower Builder Chat',
        description: 'Chat room for Tower Builder game players',
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
