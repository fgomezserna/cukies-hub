import { config } from 'dotenv';

// Load environment variables
config();

async function debugTelegramChat() {
  try {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token || !chatId) {
      console.log('❌ Missing token or chat ID');
      return;
    }

    console.log('🔍 Debugging Telegram chat configuration...');
    console.log(`Chat ID: ${chatId}`);

    // Get chat info
    const chatResponse = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`);
    const chatData = await chatResponse.json();
    
    if (chatData.ok) {
      console.log('\n📋 Chat Information:');
      console.log(`- Type: ${chatData.result.type}`);
      console.log(`- Title: ${chatData.result.title}`);
      console.log(`- Is Forum: ${chatData.result.is_forum || false}`);
      console.log(`- Has Topics: ${chatData.result.is_forum ? 'Yes' : 'No'}`);
      
      if (chatData.result.is_forum) {
        console.log('\n⚠️ This is a FORUM group - requires topic IDs!');
        console.log('Solutions:');
        console.log('1. Create topics for each game in Telegram');
        console.log('2. Use a regular group instead of forum');
        console.log('3. Get topic IDs and update database');
      } else {
        console.log('\n✅ Regular group - should work without topics');
      }
    } else {
      console.log('❌ Error getting chat info:', chatData.description);
    }

    // Try to get recent messages to see what's in the chat
    console.log('\n📨 Recent Messages:');
    const updatesResponse = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=5`);
    const updatesData = await updatesResponse.json();
    
    if (updatesData.ok && updatesData.result.length > 0) {
      updatesData.result.forEach((update: any, index: number) => {
        if (update.message) {
          console.log(`${index + 1}. From: ${update.message.from.first_name} (${update.message.from.username || 'no username'})`);
          console.log(`   Text: "${update.message.text}"`);
          console.log(`   Thread ID: ${update.message.message_thread_id || 'none'}`);
        }
      });
    } else {
      console.log('No recent messages found');
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugTelegramChat();
