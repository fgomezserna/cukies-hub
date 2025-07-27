import { prisma } from '@/lib/prisma';

export interface TelegramVerificationResult {
  success: boolean;
  error?: string;
  username?: string;
  requiresJoin?: boolean;
  status: number;
}

export interface TelegramCodeVerificationResult {
  success: boolean;
  error?: string;
  user?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  status: number;
}

export async function verifyTelegramMembership(
  telegramUsername: string, 
  walletAddress: string
): Promise<TelegramVerificationResult> {
  try {
    console.log('Telegram verification request:', { telegramUsername, walletAddress });

    // Remove @ symbol if present
    const cleanUsername = telegramUsername.replace('@', '');
    console.log('Clean username:', cleanUsername);

    // Check if this Telegram username is already taken by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        telegramUsername: cleanUsername,
        walletAddress: {
          not: walletAddress // Exclude current user
        }
      }
    });

    if (existingUser) {
      console.log('Username already taken by user:', existingUser.walletAddress);
      return {
        success: false,
        error: 'This Telegram username is already verified by another user',
        status: 409
      };
    }

    // Check if bot token and chat ID are configured
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.error('Missing Telegram configuration:', {
        hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
        hasChatId: !!process.env.TELEGRAM_CHAT_ID
      });
      return {
        success: false,
        error: 'Telegram bot configuration missing',
        status: 500
      };
    }

    // Try to get user ID from username
    console.log('Fetching user info for username:', cleanUsername);
    let userId = null;
    
    // First attempt: try to get user by username
    const userResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: `@${cleanUsername}`
      })
    });

    console.log('User response status:', userResponse.status);

    if (!userResponse.ok) {
      let errorData;
      try {
        const responseText = await userResponse.text();
        console.log('Raw error response:', responseText);
        errorData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse Telegram error response:', parseError);
        return {
          success: false,
          error: 'Telegram service temporarily unavailable',
          status: 503
        };
      }
      
      console.error('Error getting user info:', errorData);
      
      // Check if it's a "user not found" error
      if (errorData.description?.includes('not found')) {
        return {
          success: false,
          error: `Telegram username "@${cleanUsername}" not found. Please check:\n• Your username is correct\n• Your username is public (visible to others)\n• You have set a username in Telegram settings`,
          status: 404
        };
      }
      
      return {
        success: false,
        error: 'Failed to verify Telegram username',
        status: 400
      };
    }

    let userData;
    try {
      userData = await userResponse.json();
    } catch (parseError) {
      console.error('Failed to parse user response:', parseError);
      return {
        success: false,
        error: 'Telegram service error',
        status: 503
      };
    }

    userId = userData.result.id;
    console.log('Found user ID:', userId);

    // Check if user is member of the chat
    const membershipResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        user_id: userId
      })
    });

    if (!membershipResponse.ok) {
      let errorData;
      try {
        const responseText = await membershipResponse.text();
        console.log('Raw membership error response:', responseText);
        errorData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse membership error response:', parseError);
        return {
          success: false,
          error: 'Telegram service temporarily unavailable',
          status: 503
        };
      }
      
      console.error('Error checking membership:', errorData);
      
      if (errorData.description?.includes('not found') || errorData.description?.includes('not a member')) {
        return {
          success: false,
          error: 'User is not a member of the Telegram group. Please join the group first.',
          requiresJoin: true,
          status: 403
        };
      }
      
      return {
        success: false,
        error: 'Failed to verify Telegram membership',
        status: 400
      };
    }

    let membershipData;
    try {
      membershipData = await membershipResponse.json();
    } catch (parseError) {
      console.error('Failed to parse membership response:', parseError);
      return {
        success: false,
        error: 'Telegram service error',
        status: 503
      };
    }

    const memberStatus = membershipData.result.status;
    console.log('Member status:', memberStatus);

    // Check if user has valid membership status
    const validStatuses = ['creator', 'administrator', 'member'];
    
    if (!validStatuses.includes(memberStatus)) {
      return {
        success: false,
        error: 'User is not an active member of the Telegram group',
        requiresJoin: true,
        status: 403
      };
    }

    // Update user's telegram username in database
    await prisma.user.update({
      where: { walletAddress },
      data: { telegramUsername: cleanUsername }
    });

    return {
      success: true,
      username: cleanUsername,
      status: 200
    };

  } catch (error) {
    console.error('Telegram verification error:', error);
    return {
      success: false,
      error: 'Internal server error during Telegram verification',
      status: 500
    };
  }
}

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

export async function verifyTelegramByCode(
  walletAddress: string, 
  verificationCode: string
): Promise<TelegramCodeVerificationResult> {
  try {
    console.log('Telegram code verification request:', { walletAddress, verificationCode });

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return {
        success: false,
        error: 'Telegram bot configuration missing',
        status: 500
      };
    }

    // Get recent messages from the group to find the verification code
    const updatesResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (!updatesResponse.ok) {
      return {
        success: false,
        error: 'Failed to check Telegram messages',
        status: 500
      };
    }

    const updatesData = await updatesResponse.json();
    console.log('Found updates:', updatesData.result.length);
    
    // Look for the verification code in recent messages
    let verificationFound = false;
    let telegramUser = null;
    let messageId = null;

    for (const update of updatesData.result) {
      if (update.message?.text?.includes(verificationCode)) {
        console.log('Found message with code:', update.message.text);
        console.log('Message chat ID:', update.message.chat.id);
        console.log('Expected chat ID:', process.env.TELEGRAM_CHAT_ID);
        
        // Check if message is from our group
        if (update.message.chat.id.toString() === process.env.TELEGRAM_CHAT_ID) {
          verificationFound = true;
          telegramUser = update.message.from;
          messageId = update.message.message_id;
          console.log('Verification found from user:', telegramUser);
          break;
        }
      }
    }

    if (!verificationFound) {
      return {
        success: false,
        error: 'Verification code not found in group messages. Please make sure you sent the code to the correct group.',
        status: 404
      };
    }

    // Check if this Telegram user is already verified by another wallet
    const existingUser = await prisma.user.findFirst({
      where: {
        telegramUsername: telegramUser.username || `user_${telegramUser.id}`,
        walletAddress: {
          not: walletAddress
        }
      }
    });

    if (existingUser) {
      return {
        success: false,
        error: 'This Telegram account is already verified by another user',
        status: 409
      };
    }

    // Send confirmation message and delete the verification message
    if (messageId) {
      try {
        // First, send a confirmation message
        const confirmationMessage = `✅ Verification successful for @${telegramUser.username || telegramUser.first_name}! Welcome to Hyppie Gaming Platform.`;
        const sendResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: confirmationMessage,
            reply_to_message_id: messageId,
            parse_mode: 'HTML'
          })
        });

        if (sendResponse.ok) {
          console.log('Confirmation message sent');
        }

        // Then delete the verification message after a short delay
        setTimeout(async () => {
          try {
            const deleteResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                message_id: messageId
              })
            });

            if (deleteResponse.ok) {
              console.log('Successfully deleted verification message');
            } else {
              const deleteError = await deleteResponse.json();
              console.warn('Failed to delete verification message:', deleteError);
              // Don't fail the verification if we can't delete the message
            }
          } catch (deleteError) {
            console.error('Error deleting verification message:', deleteError);
          }
        }, 2000); // Delete after 2 seconds
      } catch (error) {
        console.error('Error handling verification message:', error);
        // Don't fail the verification if we can't delete the message
      }
    }

    return {
      success: true,
      user: {
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name
      },
      status: 200
    };

  } catch (error) {
    console.error('Telegram code verification error:', error);
    return {
      success: false,
      error: 'Internal server error during verification',
      status: 500
    };
  }
}