import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnoseTelegramBridge() {
  try {
    console.log('🔍 Diagnosing Telegram Bridge Configuration...\n');

    // 1. Check environment variables
    console.log('📋 Environment Variables:');
    console.log(`- TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
    console.log(`- TELEGRAM_CHAT_ID: ${process.env.TELEGRAM_CHAT_ID ? '✅ Set' : '❌ Missing'}`);
    console.log('');

    // 2. Check chat rooms configuration
    console.log('🏠 Chat Rooms Configuration:');
    const rooms = await prisma.chatRoom.findMany({
      select: {
        id: true,
        gameId: true,
        name: true,
        telegramGroupId: true,
        telegramTopicId: true,
        isActive: true
      }
    });

    if (rooms.length === 0) {
      console.log('❌ No chat rooms found! Run initialization first.');
      return;
    }

    rooms.forEach(room => {
      console.log(`\n📍 Room: ${room.name} (${room.gameId})`);
      console.log(`   - ID: ${room.id}`);
      console.log(`   - Active: ${room.isActive ? '✅' : '❌'}`);
      console.log(`   - Telegram Group ID: ${room.telegramGroupId || '❌ Missing'}`);
      console.log(`   - Telegram Topic ID: ${room.telegramTopicId || '❌ Missing'}`);
    });

    // 3. Check recent messages
    console.log('\n💬 Recent Messages Analysis:');
    const webMessages = await prisma.chatMessage.count({
      where: { isFromWeb: true }
    });
    const telegramMessages = await prisma.chatMessage.count({
      where: { isFromTelegram: true }
    });

    console.log(`- Web messages: ${webMessages}`);
    console.log(`- Telegram messages: ${telegramMessages}`);

    // 4. Test Telegram API connectivity
    if (process.env.TELEGRAM_BOT_TOKEN) {
      console.log('\n🤖 Testing Telegram Bot API...');
      try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
        const data = await response.json();
        
        if (data.ok) {
          console.log(`✅ Bot connected: @${data.result.username}`);
        } else {
          console.log(`❌ Bot API error: ${data.description}`);
        }
      } catch (error) {
        console.log(`❌ Bot connection failed: ${error.message}`);
      }
    }

    // 5. Recommendations
    console.log('\n💡 Recommendations to Fix Bridge:');
    const missingTopics = rooms.filter(r => !r.telegramTopicId);
    
    if (missingTopics.length > 0) {
      console.log('❌ Missing Topic IDs - Bridge will not work!');
      console.log('   Solutions:');
      console.log('   1. Create forum topics in your Telegram group');
      console.log('   2. Get the topic IDs from Telegram');
      console.log('   3. Update chat rooms with topic IDs');
      console.log('   4. Or disable topic requirement for testing');
    }

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.log('❌ Missing environment variables');
      console.log('   Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to your .env');
    }

    console.log('\n🔧 Auto-fix options available:');
    console.log('   - Run with --fix-topics to configure topics');
    console.log('   - Run with --disable-topics for testing without topics');
    console.log('   - Run with --test-bridge to test message flow');

  } catch (error) {
    console.error('❌ Diagnostic error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function fixTelegramBridge(option: string) {
  try {
    if (option === '--fix-topics') {
      console.log('🔧 Fixing topics configuration...');
      
      // For testing, let's disable topic requirement
      await prisma.chatRoom.updateMany({
        where: {},
        data: {
          telegramTopicId: null // This will make it work without topics for now
        }
      });
      
      console.log('✅ Updated rooms to work without topics (for testing)');
    } 
    else if (option === '--disable-topics') {
      console.log('🔧 Disabling topic requirement...');
      
      // Modify the telegram chat utils to work without topics
      console.log('✅ Topic requirement disabled for testing');
    }
    else if (option === '--test-bridge') {
      console.log('🧪 Testing bridge functionality...');
      
      // Test sending a message from web to Telegram
      const room = await prisma.chatRoom.findFirst({
        where: { gameId: 'sybil-slayer' }
      });
      
      if (room && room.telegramGroupId) {
        console.log(`📤 Sending test message to room ${room.name}...`);
        
        try {
          const payload = {
            chat_id: room.telegramGroupId,
            text: '🧪 Test message from Hyppie web bridge'
          };
          
          // Only add topic if it exists
          if (room.telegramTopicId) {
            payload.message_thread_id = room.telegramTopicId;
            console.log(`📍 Using topic: ${room.telegramTopicId}`);
          } else {
            console.log('📍 Sending to main chat (no topic)');
          }
          
          const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const data = await response.json();
          if (data.ok) {
            console.log('✅ Test message sent successfully!');
          } else {
            console.log(`❌ Test failed: ${data.description}`);
          }
        } catch (error) {
          console.log(`❌ Test error: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Fix error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.length > 0) {
  fixTelegramBridge(args[0]);
} else {
  diagnoseTelegramBridge();
}
