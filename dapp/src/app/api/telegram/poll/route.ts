import { NextRequest, NextResponse } from 'next/server';
import { getTelegramUpdates, processTelegramMessage } from '@/lib/telegram-chat-utils';
import { requireAdminApiAccess } from '@/lib/operational-access';

let lastUpdateId = 0;

export async function POST(request: NextRequest) {
  const accessDenied = await requireAdminApiAccess();
  if (accessDenied) return accessDenied;

  try {
    console.log('🔄 Polling Telegram messages...');
    
    // Get updates starting from the last processed update
    const updates = await getTelegramUpdates(lastUpdateId + 1);
    console.log(`📨 Found ${updates.length} new updates`);
    
    let processedCount = 0;
    
    for (const update of updates) {
      if (update.message) {
        try {
          console.log(`📨 Processing update ${update.update_id}: message ${update.message.message_id}`);
          await processTelegramMessage(update.message);
          processedCount++;
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
        } catch (error) {
          console.error('Error processing individual message:', error);
        }
      }
    }
    
    return NextResponse.json({ 
      ok: true,
      processed: processedCount,
      total: updates.length,
      lastUpdateId 
    });
    
  } catch (error) {
    console.error('Error polling Telegram messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const accessDenied = await requireAdminApiAccess();
  if (accessDenied) return accessDenied;

  return NextResponse.json({ 
    message: 'Telegram polling endpoint',
    lastUpdateId,
    instructions: 'Use POST to poll for new messages'
  });
}
