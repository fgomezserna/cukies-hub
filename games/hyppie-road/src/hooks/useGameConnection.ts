import { useEffect, useState, useCallback, useRef } from 'react';
import { usePusherConnection } from './usePusherConnection';

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
 * Hook for game-to-parent communication using Pusher WebSockets
 * Replaced the secure postMessage system with robust Pusher communication
 */
export function useGameConnection() {
  // Use the new robust Pusher connection system
  const {
    isConnected,
    connectionState,
    sessionData,
    sendCheckpoint: pusherSendCheckpoint,
    sendGameEnd,
    sendHoneypotTrigger,
    startCheckpointInterval: pusherStartCheckpointInterval
  } = usePusherConnection();

  const [authState, setAuthState] = useState<{
    isAuthenticated: boolean;
    user: any;
    token?: string;
  }>({
    isAuthenticated: true, // Default to authenticated for Pusher system
    user: null, // User data is not available in game context
  });

  // Use ref instead of state for checkpoint interval to avoid re-renders
  const checkpointIntervalRef = useRef<NodeJS.Timeout | (() => void) | null>(null);

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

  // Send checkpoint to parent using Pusher
  const sendCheckpoint = useCallback((score: number, gameTime: number, events?: any[]) => {
    if (!sessionData) return;

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
      // Send honeypot via Pusher
      sendHoneypotTrigger(honeypotEvent);
    }

    // Send checkpoint via Pusher with events included
    pusherSendCheckpoint({
      score,
      gameTime,
      events: events || []
    });
  }, [sessionData, generateCheckpointHash, pusherSendCheckpoint, sendHoneypotTrigger]);

  // Send session end to parent using Pusher
  const sendSessionEnd = useCallback((finalScore: number, metadata?: any) => {
    // Send game end via Pusher with sessionToken included
    sendGameEnd({
      finalScore,
      gameTime: Date.now(), // Will be calculated properly in the calling component
      metadata
    });

    // Clear checkpoint interval
    if (checkpointIntervalRef.current) {
      if (typeof checkpointIntervalRef.current === 'function') {
        checkpointIntervalRef.current();
      } else {
        clearInterval(checkpointIntervalRef.current);
      }
      checkpointIntervalRef.current = null;
    }
  }, [sendGameEnd]);

  // Honeypot trigger is handled directly in sendCheckpoint via Pusher
  // No need for separate implementation here

  // Start periodic checkpoints using Pusher
  const startCheckpointInterval = useCallback((getCurrentScore: () => number, getCurrentGameTime: () => number) => {
    // Clear existing interval if any
    if (checkpointIntervalRef.current) {
      if (typeof checkpointIntervalRef.current === 'function') {
        checkpointIntervalRef.current();
      } else {
        clearInterval(checkpointIntervalRef.current);
      }
    }

    // Use the Pusher checkpoint interval system
    const stopInterval = pusherStartCheckpointInterval(getCurrentScore, getCurrentGameTime, 5000);
    
    // Store the stop function in ref for cleanup
    checkpointIntervalRef.current = stopInterval;
  }, [pusherStartCheckpointInterval]);

  // Stop periodic checkpoints
  const stopCheckpointInterval = useCallback(() => {
    if (checkpointIntervalRef.current) {
      // Call the stop function if it's the Pusher system
      if (typeof checkpointIntervalRef.current === 'function') {
        checkpointIntervalRef.current();
      } else {
        // Fallback for old interval system
        clearInterval(checkpointIntervalRef.current);
      }
      checkpointIntervalRef.current = null;
    }
  }, []);

  // Update auth state when session data changes
  useEffect(() => {
    if (sessionData) {
      setAuthState({
        isAuthenticated: true,
        user: { id: 'game-user' }, // User data is not available in game context
        token: sessionData.sessionToken
      });
    }
  }, [sessionData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkpointIntervalRef.current) {
        if (typeof checkpointIntervalRef.current === 'function') {
          checkpointIntervalRef.current();
        } else {
          clearInterval(checkpointIntervalRef.current);
        }
      }
    };
  }, []);

  return {
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    token: authState.token,
    gameSession: sessionData, // Return sessionData as gameSession for compatibility
    sendCheckpoint,
    sendSessionEnd,
    sendHoneypotTrigger: sendHoneypotTrigger, // Use Pusher honeypot system
    startCheckpointInterval,
    stopCheckpointInterval
  };
}