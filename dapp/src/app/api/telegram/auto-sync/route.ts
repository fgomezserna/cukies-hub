import { NextRequest, NextResponse } from 'next/server';
import { getTelegramUpdates, processTelegramMessage } from '@/lib/telegram-chat-utils';

let isPolling = false;
let pollingInterval: NodeJS.Timeout | null = null;

async function performSync() {
  try {
    console.log('🔄 Auto-sync: Checking for Telegram messages...');
    const updates = await getTelegramUpdates();
    
    let processedCount = 0;
    for (const update of updates) {
      if (update.message) {
        try {
          await processTelegramMessage(update.message);
          processedCount++;
        } catch (error) {
          console.error('Error processing message:', error);
        }
      }
    }
    
    if (processedCount > 0) {
      console.log(`✅ Auto-sync: Processed ${processedCount} messages from Telegram`);
    }
    
    return processedCount;
  } catch (error) {
    console.error('❌ Auto-sync error:', error);
    return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, interval = 10000 } = await request.json();
    
    if (action === 'start') {
      if (isPolling) {
        return NextResponse.json({ message: 'Auto-sync already running', isActive: true });
      }
      
      isPolling = true;
      
      // Perform initial sync
      const initialCount = await performSync();
      
      // Start interval
      pollingInterval = setInterval(async () => {
        if (isPolling) {
          await performSync();
        }
      }, interval);
      
      return NextResponse.json({ 
        message: 'Auto-sync started', 
        initialSync: initialCount,
        interval,
        isActive: true 
      });
      
    } else if (action === 'stop') {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      isPolling = false;
      
      return NextResponse.json({ message: 'Auto-sync stopped', isActive: false });
      
    } else if (action === 'status') {
      return NextResponse.json({ 
        isActive: isPolling,
        interval: pollingInterval ? interval : null
      });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('Auto-sync endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    isActive: isPolling,
    hasInterval: pollingInterval !== null,
    message: 'Telegram auto-sync service status'
  });
}