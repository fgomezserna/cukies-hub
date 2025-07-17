import { useEffect, useState, useCallback, useRef } from 'react';

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

// Game message types
type GameMessage = 
  | { type: 'AUTH_STATE_CHANGED'; payload: { isAuthenticated: boolean; user: any; token?: string } }
  | { type: 'GAME_SESSION_START'; payload: { gameId: string; sessionToken: string; sessionId: string } }
  | { type: 'GAME_CHECKPOINT'; payload: { sessionToken: string; checkpoint: any; events?: any[] } }
  | { type: 'GAME_SESSION_END'; payload: { sessionToken: string; finalScore: number; metadata?: any } }
  | { type: 'GAME_EVENT'; payload: { sessionToken: string; event: string; data?: any } }
  | { type: 'HONEYPOT_TRIGGER'; payload: { sessionToken: string; event: string } };

const TARGET_ORIGIN = process.env.NODE_ENV === 'production' 
  ? 'https://hyppieliquid.com' 
  : '*';

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
  const sendCheckpoint = useCallback((score: number, gameTime: number, events?: any[]) => {
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

    const message: GameMessage = {
      type: 'GAME_CHECKPOINT',
      payload: {
        sessionToken: gameSession.sessionToken,
        checkpoint,
        events
      }
    };

    console.log('🎮 [GAME] Sending checkpoint:', message);
    window.parent.postMessage(message, TARGET_ORIGIN);
  }, [gameSession, generateCheckpointHash]);

  // Send session end to parent
  const sendSessionEnd = useCallback((finalScore: number, metadata?: any) => {
    if (!gameSession) return;

    const message: GameMessage = {
      type: 'GAME_SESSION_END',
      payload: {
        sessionToken: gameSession.sessionToken,
        finalScore,
        metadata
      }
    };

    console.log('🏁 [GAME] Sending session end:', message);
    window.parent.postMessage(message, TARGET_ORIGIN);

    // Clear checkpoint interval
    if (checkpointIntervalRef.current) {
      clearInterval(checkpointIntervalRef.current);
      checkpointIntervalRef.current = null;
    }
  }, [gameSession]);

  // Send honeypot trigger to parent
  const sendHoneypotTrigger = useCallback((event: string) => {
    if (!gameSession) return;

    const message: GameMessage = {
      type: 'HONEYPOT_TRIGGER',
      payload: {
        sessionToken: gameSession.sessionToken,
        event
      }
    };

    console.log('🍯 [GAME] Sending honeypot trigger:', message);
    window.parent.postMessage(message, TARGET_ORIGIN);
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
    const handleMessage = (event: MessageEvent) => {
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
      
      const message = event.data as GameMessage;
      
      switch (message.type) {
        case 'AUTH_STATE_CHANGED':
          console.log('🔐 [GAME] Auth state changed:', message.payload);
          setAuthState(message.payload);
          break;
        
        case 'GAME_SESSION_START':
          console.log('🚀 [GAME] Game session started:', message.payload);
          setGameSession(message.payload);
          break;
        
        default:
          console.log('🔄 [GAME] Ignored message type:', message.type);
          break;
      }
    };

    console.log('🎧 [GAME] Starting to listen for parent messages...');
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