import { NextRequest, NextResponse } from 'next/server';
import { getTelegramUpdates, processTelegramMessage } from '@/lib/telegram-chat-utils';

let isPolling = false;
let lastUpdateId = 0;

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Manual Telegram sync triggered...');
    
    if (isPolling) {
      return NextResponse.json({ 
        message: 'Sync already in progress',
        status: 'busy'
      });
    }

    isPolling = true;
    let processedCount = 0;
    
    try {
      // Get updates starting from the last processed update
      const updates = await getTelegramUpdates(lastUpdateId + 1);
      console.log(`📨 Found ${updates.length} new Telegram updates`);
      
      for (const update of updates) {
        if (update.message) {
          try {
            console.log(`📨 Processing update ${update.update_id}: message ${update.message.message_id}`);
            console.log(`   From: ${update.message.from.first_name} in topic ${update.message.message_thread_id || 'main'}`);
            
            await processTelegramMessage(update.message);
            processedCount++;
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
          } catch (error) {
            console.error('Error processing individual message:', error);
          }
        }
      }
      
      console.log(`✅ Processed ${processedCount} messages from Telegram`);
      
      return NextResponse.json({ 
        success: true,
        processed: processedCount,
        total: updates.length,
        lastUpdateId,
        message: `Processed ${processedCount} new messages`
      });
      
    } finally {
      isPolling = false;
    }
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    isPolling = false;
    const message = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json({ 
      success: false,
      error: 'Sync failed',
      details: message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Get sync status
  return NextResponse.json({
    isPolling,
    lastUpdateId,
    botStatus: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured',
    chatId: process.env.TELEGRAM_CHAT_ID ? 'configured' : 'not configured'
  });
}

