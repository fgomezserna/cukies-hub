// Secret key for game communication (should match the DApp key)
// Read from env variable so games and dapp use the same secret
const GAME_COMMUNICATION_KEY =
  process.env.NEXT_PUBLIC_GAME_COMMUNICATION_KEY || 'hyppie-secure-game-key-2024';

/**
 * Game message types for secure communication
 */
export type GameMessageType = 
  | 'AUTH_STATE_CHANGED'
  | 'GAME_SESSION_START'
  | 'GAME_CHECKPOINT'
  | 'GAME_SESSION_END'
  | 'GAME_EVENT'
  | 'HONEYPOT_TRIGGER';

/**
 * Base interface for all game messages
 */
export interface SecureGameMessage {
  type: GameMessageType;
  payload: any;
  timestamp: number;
  nonce: string;
  signature: string;
}

/**
 * Generate a secure nonce for message uniqueness
 */
export function generateMessageNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate HMAC signature for a message (browser-compatible)
 */
export async function generateMessageSignature(message: Omit<SecureGameMessage, 'signature'>): Promise<string> {
  const dataToSign = JSON.stringify({
    type: message.type,
    payload: message.payload,
    timestamp: message.timestamp,
    nonce: message.nonce
  });
  
  // Check if crypto.subtle is available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      // Convert string to ArrayBuffer
      const encoder = new TextEncoder();
      const data = encoder.encode(dataToSign);
      const keyData = encoder.encode(GAME_COMMUNICATION_KEY);
      
      // Import key
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      // Sign the data
      const signature = await crypto.subtle.sign('HMAC', key, data);
      
      // Convert to hex string
      return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('⚠️ [SECURITY] crypto.subtle failed, falling back to alternative implementation:', error);
    }
  }
  
  // Fallback implementation using simple hash + key
  return generateFallbackSignature(dataToSign);
}

/**
 * Fallback signature generation when crypto.subtle is not available
 */
function generateFallbackSignature(data: string): string {
  // Simple hash-based signature for fallback
  // In production, consider using a more robust implementation
  const combined = data + GAME_COMMUNICATION_KEY;
  let hash = 0;
  
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to hex string
  return Math.abs(hash).toString(16).padStart(8, '0') + 
         combined.length.toString(16).padStart(4, '0');
}

/**
 * Verify HMAC signature of a message (browser-compatible)
 */
export async function verifyMessageSignature(message: SecureGameMessage): Promise<boolean> {
  try {
    const expectedSignature = await generateMessageSignature({
      type: message.type,
      payload: message.payload,
      timestamp: message.timestamp,
      nonce: message.nonce
    });
    
    return message.signature === expectedSignature;
  } catch (error) {
    console.error('❌ [SECURITY] Error verifying message signature:', error);
    return false;
  }
}

/**
 * Create a secure game message
 */
export async function createSecureMessage(type: GameMessageType, payload: any): Promise<SecureGameMessage> {
  const timestamp = Date.now();
  const nonce = generateMessageNonce();
  
  const message: Omit<SecureGameMessage, 'signature'> = {
    type,
    payload,
    timestamp,
    nonce
  };
  
  const signature = await generateMessageSignature(message);
  
  return {
    ...message,
    signature
  };
}

/**
 * Validate message timestamp (prevent replay attacks)
 */
export function validateMessageTimestamp(message: SecureGameMessage, maxAgeMs: number = 30000): boolean {
  const now = Date.now();
  const messageAge = now - message.timestamp;
  
  // Message should not be older than maxAgeMs (default: 30 seconds)
  if (messageAge > maxAgeMs) {
    console.warn('⚠️ [SECURITY] Message too old:', { messageAge, maxAgeMs });
    return false;
  }
  
  // Message should not be from the future (with 5 second tolerance)
  if (messageAge < -5000) {
    console.warn('⚠️ [SECURITY] Message from future:', { messageAge });
    return false;
  }
  
  return true;
}

/**
 * Comprehensive message validation
 */
export async function validateSecureMessage(message: any): Promise<{
  isValid: boolean;
  reason?: string;
  parsedMessage?: SecureGameMessage;
}> {
  try {
    // Basic structure validation
    if (!message || typeof message !== 'object') {
      return { isValid: false, reason: 'Invalid message structure' };
    }
    
    if (!message.type || !message.payload || !message.timestamp || !message.nonce || !message.signature) {
      return { isValid: false, reason: 'Missing required message fields' };
    }
    
    // Type validation
    const validTypes: GameMessageType[] = [
      'AUTH_STATE_CHANGED',
      'GAME_SESSION_START', 
      'GAME_CHECKPOINT',
      'GAME_SESSION_END',
      'GAME_EVENT',
      'HONEYPOT_TRIGGER'
    ];
    
    if (!validTypes.includes(message.type)) {
      return { isValid: false, reason: 'Invalid message type' };
    }
    
    // Timestamp validation
    if (!validateMessageTimestamp(message)) {
      return { isValid: false, reason: 'Invalid message timestamp' };
    }
    
    // Signature validation
    if (!(await verifyMessageSignature(message))) {
      return { isValid: false, reason: 'Invalid message signature' };
    }
    
    return { 
      isValid: true, 
      parsedMessage: message as SecureGameMessage 
    };
    
  } catch (error) {
    console.error('❌ [SECURITY] Error validating secure message:', error);
    return { isValid: false, reason: 'Validation error' };
  }
}

/**
 * Extract message data without signature for processing
 */
export function extractMessageData(message: SecureGameMessage): {
  type: GameMessageType;
  payload: any;
  timestamp: number;
  nonce: string;
} {
  return {
    type: message.type,
    payload: message.payload,
    timestamp: message.timestamp,
    nonce: message.nonce
  };
}

/**
 * Send secure message to parent (DApp)
 */
export async function sendSecureMessageToParent(type: GameMessageType, payload: any): Promise<void> {
  try {
    const secureMessage = await createSecureMessage(type, payload);
    console.log('📤 [GAME] Sending secure message to parent:', secureMessage);
    // Broadcast to parent without assuming a specific origin.
    // The dapp performs its own origin validation.
    window.parent.postMessage(secureMessage, '*');
  } catch (error) {
    console.error('❌ [GAME] Error sending secure message:', error);
  }
}

/**
 * Log security events for monitoring
 */
export function logSecurityEvent(event: string, details: any) {
  console.log(`🔐 [SECURITY] ${event}:`, details);
} 