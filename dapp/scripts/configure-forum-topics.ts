import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config();
const prisma = new PrismaClient();

async function configureForumTopics() {
  try {
    console.log('🎯 Configuring Forum Topic IDs...\n');

    // Let's create a mapping of games to topic IDs
    // You should create specific topics in Telegram for each game
    const gameTopicMapping = [
      {
        gameId: 'sybil-slayer',
        topicId: 1532, // Use the topic ID from recent messages
        description: 'Sybil Slayer game chat topic'
      },
      {
        gameId: 'hyppie-road', 
        topicId: 4, // Use another topic ID from recent messages
        description: 'Hyppie Road game chat topic'
      },
      {
        gameId: 'tower-builder',
        topicId: 1532, // Share with sybil-slayer for now
        description: 'Tower Builder game chat topic'
      }
    ];

    for (const mapping of gameTopicMapping) {
      const room = await prisma.chatRoom.findUnique({
        where: { gameId: mapping.gameId }
      });

      if (room) {
        await prisma.chatRoom.update({
          where: { id: room.id },
          data: { 
            telegramTopicId: mapping.topicId,
            description: mapping.description
          }
        });

        console.log(`✅ Updated ${mapping.gameId} with topic ID: ${mapping.topicId}`);
      } else {
        console.log(`⚠️ Room not found for ${mapping.gameId}`);
      }
    }

    console.log('\n🧪 Testing updated configuration...');
    
    // Test sending a message to each configured topic
    for (const mapping of gameTopicMapping) {
      const room = await prisma.chatRoom.findUnique({
        where: { gameId: mapping.gameId }
      });

      if (room && room.telegramGroupId && room.telegramTopicId) {
        try {
          const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: room.telegramGroupId,
              text: `🎮 ${room.name} bridge is now active! (Topic: ${room.telegramTopicId})`,
              message_thread_id: room.telegramTopicId
            })
          });

          const data = await response.json();
          if (data.ok) {
            console.log(`✅ Test message sent to ${mapping.gameId} (topic ${mapping.topicId})`);
          } else {
            console.log(`❌ Test failed for ${mapping.gameId}: ${data.description}`);
          }
        } catch (error) {
          console.log(`❌ Test error for ${mapping.gameId}: ${error.message}`);
        }
      }
    }

    console.log('\n🎉 Forum topic configuration complete!');
    console.log('💡 Next steps:');
    console.log('1. Send messages from web chat to test Web → Telegram');
    console.log('2. Send messages in Telegram topics to test Telegram → Web');
    console.log('3. Set up polling/webhook for real-time sync');

  } catch (error) {
    console.error('❌ Configuration error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

configureForumTopics();

