import { useEffect, useState, useCallback, useRef } from 'react';
import { 
  validateSecureMessage, 
  extractMessageData, 
  sendSecureMessageToParent,
  logSecurityEvent,
  type GameMessageType 
} from '../lib/secure-communication';

// Simple hash function for browser compatibility
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// Honeypot events for cheat detection
const HONEYPOT_EVENTS = [
  'dev_mode_enabled',
  'time_manipulation_detected', 
  'score_multiplier_x10',
  'god_mode_activated',
  'admin_mode_enabled',
  'debug_mode_active',
  'infinite_lives_activated',
  'auto_play_enabled',
  'speed_hack_detected',
  'memory_manipulation',
  'client_side_validation_bypass'
];

/**
 * Hook for game-to-parent communication with security features
 * Used in games to communicate with the DApp parent
 */
export function useGameConnection() {
  const [authState, setAuthState] = useState<{
    isAuthenticated: boolean;
    user: any;
    token?: string;
  }>({
    isAuthenticated: false,
    user: null,
  });

  const [gameSession, setGameSession] = useState<{
    gameId: string;
    sessionToken: string;
    sessionId: string;
  } | null>(null);

  // Use ref instead of state for checkpoint interval to avoid re-renders
  const checkpointIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Generate checkpoint hash
  const generateCheckpointHash = useCallback((checkpoint: any): string => {
    const data = JSON.stringify({
      timestamp: checkpoint.timestamp,
      score: checkpoint.score,
      gameTime: checkpoint.gameTime,
      nonce: checkpoint.nonce || ''
    });
    return simpleHash(data);
  }, []);

  // Send checkpoint to parent
  const sendCheckpoint = useCallback(async (score: number, gameTime: number, events?: any[]) => {
    if (!gameSession) return;

    const checkpoint = {
      timestamp: Date.now(),
      score,
      gameTime,
      nonce: Math.random().toString(36).substring(2, 15),
      hash: ''
    };

    checkpoint.hash = generateCheckpointHash(checkpoint);

    // Randomly send honeypot events
    const shouldSendHoneypot = Math.random() < 0.1; // 10% chance
    if (shouldSendHoneypot) {
      const honeypotEvent = HONEYPOT_EVENTS[Math.floor(Math.random() * HONEYPOT_EVENTS.length)];
      events = [...(events || []), { type: 'honeypot', event: honeypotEvent }];
    }

    // Send secure checkpoint message
    await sendSecureMessageToParent('GAME_CHECKPOINT', {
      sessionToken: gameSession.sessionToken,
      checkpoint,
      events
    });
  }, [gameSession, generateCheckpointHash]);

  // Send session end to parent
  const sendSessionEnd = useCallback(async (finalScore: number, metadata?: any) => {
    if (!gameSession) return;

    // Send secure session end message
    await sendSecureMessageToParent('GAME_SESSION_END', {
      sessionToken: gameSession.sessionToken,
      finalScore,
      metadata
    });

    // Clear checkpoint interval
    if (checkpointIntervalRef.current) {
      clearInterval(checkpointIntervalRef.current);
      checkpointIntervalRef.current = null;
    }
  }, [gameSession]);

  // Send honeypot trigger to parent
  const sendHoneypotTrigger = useCallback(async (event: string) => {
    if (!gameSession) return;

    // Send secure honeypot trigger message
    await sendSecureMessageToParent('HONEYPOT_TRIGGER', {
      sessionToken: gameSession.sessionToken,
      event
    });
  }, [gameSession]);

  // Start periodic checkpoints
  const startCheckpointInterval = useCallback((getCurrentScore: () => number, getCurrentGameTime: () => number) => {
    // Clear existing interval if any
    if (checkpointIntervalRef.current) {
      clearInterval(checkpointIntervalRef.current);
    }

    const interval = setInterval(() => {
      const score = getCurrentScore();
      const gameTime = getCurrentGameTime();
      sendCheckpoint(score, gameTime);
    }, 5000); // Send checkpoint every 5 seconds

    checkpointIntervalRef.current = interval;
  }, [sendCheckpoint]);

  // Stop periodic checkpoints
  const stopCheckpointInterval = useCallback(() => {
    if (checkpointIntervalRef.current) {
      clearInterval(checkpointIntervalRef.current);
      checkpointIntervalRef.current = null;
    }
  }, []);

  // Listen for messages from parent
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Filter out non-game messages (MetaMask, etc.)
      if (!event.data || typeof event.data !== 'object') {
        return;
      }

      // Ignore MetaMask messages specifically
      if (event.data.target === 'metamask-inpage' || 
          event.data.name === 'metamask-provider' ||
          event.data.method?.startsWith('metamask_')) {
        return;
      }

      // Only process messages with a type
      if (!event.data.type) {
        return;
      }

      console.log('🎮 [GAME] Received message from parent:', event.data);
      
      // Validate secure message
      const validation = await validateSecureMessage(event.data);
      if (!validation.isValid) {
        logSecurityEvent('Invalid message received', { 
          reason: validation.reason, 
          message: event.data 
        });
        return;
      }

      const message = validation.parsedMessage!;
      const messageData = extractMessageData(message);
      
      logSecurityEvent('Valid message received', { 
        type: messageData.type 
      });
      
      switch (messageData.type) {
        case 'AUTH_STATE_CHANGED':
          console.log('🔐 [GAME] Auth state changed:', messageData.payload);
          setAuthState(messageData.payload);
          break;
        
        case 'GAME_SESSION_START':
          console.log('🚀 [GAME] Game session started:', messageData.payload);
          setGameSession(messageData.payload);
          break;
        
        default:
          console.log('🔄 [GAME] Ignored message type:', messageData.type);
          break;
      }
    };

    console.log('🎧 [GAME] Starting to listen for secure parent messages...');
    window.addEventListener('message', handleMessage);
    return () => {
      console.log('🔇 [GAME] Stopped listening for parent messages');
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkpointIntervalRef.current) {
        clearInterval(checkpointIntervalRef.current);
      }
    };
  }, []);

  return {
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    token: authState.token,
    gameSession,
    sendCheckpoint,
    sendSessionEnd,
    sendHoneypotTrigger,
    startCheckpointInterval,
    stopCheckpointInterval
  };
}