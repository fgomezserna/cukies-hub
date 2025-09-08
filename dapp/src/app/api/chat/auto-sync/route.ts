import { NextRequest, NextResponse } from 'next/server';
import { getTelegramUpdates, processTelegramMessage } from '@/lib/telegram-chat-utils';

let isAutoSyncActive = false;
let syncInterval: NodeJS.Timeout | null = null;
let lastUpdateId = 0;
let syncStats = {
  totalRuns: 0,
  totalProcessed: 0,
  lastRun: null as Date | null,
  lastError: null as string | null
};

async function performAutoSync() {
  try {
    console.log('🔄 Auto-sync: Checking for Telegram messages...');
    syncStats.lastRun = new Date();
    syncStats.totalRuns++;
    
    const updates = await getTelegramUpdates(lastUpdateId + 1);
    
    let processedCount = 0;
    for (const update of updates) {
      if (update.message) {
        try {
          await processTelegramMessage(update.message);
          processedCount++;
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
        } catch (error) {
          console.error('Error processing message in auto-sync:', error);
        }
      }
    }
    
    if (processedCount > 0) {
      console.log(`✅ Auto-sync: Processed ${processedCount} messages from Telegram`);
      syncStats.totalProcessed += processedCount;
    }
    
    syncStats.lastError = null;
    return processedCount;
  } catch (error) {
    console.error('❌ Auto-sync error:', error);
    syncStats.lastError = error.message;
    return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, intervalSeconds = 30 } = await request.json();
    
    if (action === 'start') {
      if (isAutoSyncActive) {
        return NextResponse.json({ 
          message: 'Auto-sync is already active',
          isActive: true,
          stats: syncStats
        });
      }
      
      console.log(`🚀 Starting auto-sync with ${intervalSeconds}s interval...`);
      isAutoSyncActive = true;
      
      // Run initial sync
      await performAutoSync();
      
      // Set up interval
      syncInterval = setInterval(performAutoSync, intervalSeconds * 1000);
      
      return NextResponse.json({ 
        message: `Auto-sync started with ${intervalSeconds}s interval`,
        isActive: true,
        intervalSeconds,
        stats: syncStats
      });
    } 
    else if (action === 'stop') {
      if (!isAutoSyncActive) {
        return NextResponse.json({ 
          message: 'Auto-sync is not active',
          isActive: false,
          stats: syncStats
        });
      }
      
      console.log('🛑 Stopping auto-sync...');
      isAutoSyncActive = false;
      
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
      
      return NextResponse.json({ 
        message: 'Auto-sync stopped',
        isActive: false,
        stats: syncStats
      });
    }
    else if (action === 'sync-now') {
      const processed = await performAutoSync();
      return NextResponse.json({ 
        message: `Manual sync completed, processed ${processed} messages`,
        processed,
        stats: syncStats
      });
    }
    else {
      return NextResponse.json({ 
        error: 'Invalid action. Use start, stop, or sync-now' 
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('❌ Auto-sync endpoint error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    isActive: isAutoSyncActive,
    intervalMs: syncInterval ? 30000 : null,
    lastUpdateId,
    stats: syncStats,
    botStatus: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured',
    chatId: process.env.TELEGRAM_CHAT_ID ? 'configured' : 'not configured'
  });
}

