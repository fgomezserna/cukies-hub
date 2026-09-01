/**
 * Deletes a message from Telegram chat
 * @param messageId - The message ID to delete
 * @returns Promise<boolean> - true if deletion was successful
 */
export async function deleteTelegramMessage(messageId: number): Promise<boolean> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.error('Missing Telegram configuration for message deletion');
      return false;
    }

    const deleteResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        message_id: messageId
      })
    });

    if (deleteResponse.ok) {
      console.log('Successfully deleted message:', messageId);
      return true;
    } else {
      const deleteError = await deleteResponse.json();
      console.warn('Failed to delete message:', deleteError);
      return false;
    }
  } catch (error) {
    console.error('Error deleting Telegram message:', error);
    return false;
  }
}

/**
 * Cleans up old verification codes from the Telegram chat
 * This can be run periodically to remove expired codes
 * @param codePattern - Optional regex pattern to match verification codes (default: 6-digit codes)
 * @param maxAgeMinutes - Maximum age of messages to keep (default: 10 minutes)
 */
export async function cleanupOldVerificationCodes(
  codePattern: RegExp = /\b\d{6}\b/,
  maxAgeMinutes: number = 10
): Promise<number> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.error('Missing Telegram configuration for cleanup');
      return 0;
    }

    const updatesResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (!updatesResponse.ok) {
      console.error('Failed to fetch updates for cleanup');
      return 0;
    }

    const updatesData = await updatesResponse.json();
    const now = Date.now() / 1000; // Convert to seconds
    const maxAge = maxAgeMinutes * 60; // Convert to seconds
    let deletedCount = 0;

    for (const update of updatesData.result) {
      if (update.message?.text && update.message.chat.id.toString() === process.env.TELEGRAM_CHAT_ID) {
        const messageAge = now - update.message.date;
        
        // Check if message contains a verification code and is old enough
        if (codePattern.test(update.message.text) && messageAge > maxAge) {
          const deleted = await deleteTelegramMessage(update.message.message_id);
          if (deleted) {
            deletedCount++;
          }
        }
      }
    }

    console.log(`Cleaned up ${deletedCount} old verification messages`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up verification codes:', error);
    return 0;
  }
}
