import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { getTelegramUpdates, processTelegramMessage } from '../src/lib/telegram-chat-utils';

config();
const prisma = new PrismaClient();

async function testCompleteBridge() {
  try {
    console.log('🧪 Testing Complete Telegram Bridge...\n');

    // 1. Verify configuration
    console.log('📋 Configuration Check:');
    const rooms = await prisma.chatRoom.findMany({
      where: { telegramTopicId: { not: null } }
    });
    
    console.log(`✅ Found ${rooms.length} rooms with topic IDs configured`);
    rooms.forEach(room => {
      console.log(`   - ${room.name}: Topic ${room.telegramTopicId}`);
    });

    // 2. Test Web → Telegram (simulate message creation)
    console.log('\n📤 Testing Web → Telegram:');
    const testRoom = rooms[0];
    if (testRoom) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: testRoom.telegramGroupId,
            text: `🧪 Bridge test from web chat - ${new Date().toLocaleTimeString()}`,
            message_thread_id: testRoom.telegramTopicId
          })
        });

        const data = await response.json();
        if (data.ok) {
          console.log('✅ Web → Telegram: Message sent successfully');
          
          // Store in database to simulate web message
          await prisma.chatMessage.create({
            data: {
              roomId: testRoom.id,
              content: `🧪 Bridge test from web chat - ${new Date().toLocaleTimeString()}`,
              messageType: 'TEXT',
              isFromWeb: true,
              telegramMessageId: data.result.message_id
            }
          });
        } else {
          console.log(`❌ Web → Telegram failed: ${data.description}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`❌ Web → Telegram error: ${message}`);
      }
    }

    // 3. Test Telegram → Web (fetch and process recent messages)
    console.log('\n📥 Testing Telegram → Web:');
    try {
      const updates = await getTelegramUpdates();
      console.log(`📨 Found ${updates.length} recent Telegram updates`);
      
      let processedCount = 0;
      for (const update of updates.slice(-5)) { // Process last 5 messages
        if (update.message && update.message.message_thread_id) {
          try {
            await processTelegramMessage(update.message);
            processedCount++;
            console.log(`✅ Processed message from ${update.message.from.first_name}: "${update.message.text?.slice(0, 30)}..."`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`❌ Error processing message: ${message}`);
          }
        }
      }
      
      if (processedCount > 0) {
        console.log(`✅ Telegram → Web: Processed ${processedCount} messages`);
      } else {
        console.log('⚠️ Telegram → Web: No new messages to process');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`❌ Telegram → Web error: ${message}`);
    }

    // 4. Check final database state
    console.log('\n📊 Final Database State:');
    const webMessages = await prisma.chatMessage.count({
      where: { isFromWeb: true }
    });
    const telegramMessages = await prisma.chatMessage.count({
      where: { isFromTelegram: true }
    });
    
    console.log(`- Web messages: ${webMessages}`);
    console.log(`- Telegram messages: ${telegramMessages}`);
    console.log(`- Total: ${webMessages + telegramMessages}`);

    console.log('\n✅ Bridge test completed!');
    console.log('\n💡 Next steps:');
    console.log('1. Start the Next.js development server');
    console.log('2. Open a game and test the chat UI');
    console.log('3. Send messages in both directions');
    console.log('4. Use /api/chat/auto-sync to start continuous sync');

  } catch (error) {
    console.error('❌ Bridge test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCompleteBridge();

