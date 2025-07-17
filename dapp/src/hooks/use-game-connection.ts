import { useEffect, RefObject, useCallback, useState, useRef } from 'react';
import { generateCheckpointHash, generateNonce, HONEYPOT_EVENTS } from '@/lib/game-validation';

// Define message types for game communication
type GameMessage = 
  | { type: 'AUTH_STATE_CHANGED'; payload: { isAuthenticated: boolean; user: any; token?: string } }
  | { type: 'GAME_SESSION_START'; payload: { gameId: string; sessionToken: string; sessionId: string } }
  | { type: 'GAME_CHECKPOINT'; payload: { sessionToken: string; checkpoint: any; events?: any[] } }
  | { type: 'GAME_SESSION_END'; payload: { sessionToken: string; finalScore: number; metadata?: any } }
  | { type: 'GAME_EVENT'; payload: { sessionToken: string; event: string; data?: any } }
  | { type: 'HONEYPOT_TRIGGER'; payload: { sessionToken: string; event: string } };

type GameConnectionOptions = {
  gameId: string;
  gameVersion?: string;
  onSessionStart?: (sessionData: { sessionToken: string; sessionId: string }) => void;
  onCheckpoint?: (checkpoint: any) => void;
  onSessionEnd?: (result: { finalScore: number; isValid: boolean }) => void;
  onHoneypotDetected?: (event: string) => void;
};

const TARGET_ORIGIN = process.env.NODE_ENV === 'production' 
  ? 'https://hyppie-road.vercel.app' // Game domain in production
  : '*'; // Allow all origins in development

/**
 * Enhanced hook for game-to-parent communication with security features
 * Used in the DApp (parent container) to handle game sessions
 */
export function useGameConnection(
  iframeRef: RefObject<HTMLIFrameElement>,
  authData: { isAuthenticated: boolean; user: any; token?: string },
  options: GameConnectionOptions
) {
  const [currentSession, setCurrentSession] = useState<{
    sessionToken: string;
    sessionId: string;
    gameId: string;
  } | null>(null);

  const [gameStats, setGameStats] = useState({
    checkpointsReceived: 0,
    honeypotEvents: 0,
    sessionValid: true
  });

  // Flag to prevent multiple session starts
  const sessionStartedRef = useRef(false);
  // Flag to prevent multiple auth sends
  const authSentRef = useRef(false);
  // Flag to track if the hook has been initialized
  const initializedRef = useRef(false);

  // Start a new game session
  const startGameSession = useCallback(async (userId: string) => {
    if (!authData.isAuthenticated || !userId) {
      console.log('🚫 [DAPP] Cannot start session - not authenticated or no userId');
      return;
    }

    // Prevent multiple session starts
    if (sessionStartedRef.current) {
      console.log('🚫 [DAPP] Session already started, skipping...');
      return;
    }

    sessionStartedRef.current = true;

    console.log('🚀 [DAPP] Starting game session for userId:', userId, 'gameId:', options.gameId);

    try {
      const response = await fetch('/api/games/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          gameId: options.gameId,
          gameVersion: options.gameVersion
        })
      });

      const data = await response.json();
      console.log('📡 [DAPP] Session API response:', data);
      
      if (data.success) {
        const sessionData = {
          sessionToken: data.sessionToken,
          sessionId: data.sessionId
        };
        
        setCurrentSession({
          sessionToken: data.sessionToken,
          sessionId: data.sessionId,
          gameId: options.gameId
        });

        // Send session data to game
        if (iframeRef.current) {
          const message: GameMessage = {
            type: 'GAME_SESSION_START',
            payload: { 
              gameId: options.gameId, 
              sessionToken: data.sessionToken, 
              sessionId: data.sessionId 
            }
          };
          console.log('📨 [DAPP] Sending session start message to game:', message);
          // Send to all possible game origins
          const gameOrigins = ['http://localhost:9002', 'http://localhost:9003', 'https://hyppie-road.vercel.app'];
          gameOrigins.forEach(origin => {
            iframeRef.current?.contentWindow?.postMessage(message, origin);
          });
        } else {
          console.warn('⚠️ [DAPP] No iframe reference available');
        }

        options.onSessionStart?.(sessionData);
      } else {
        console.error('❌ [DAPP] Session start failed:', data);
        sessionStartedRef.current = false; // Reset flag on failure
      }
    } catch (error) {
      console.error('❌ [DAPP] Failed to start game session:', error);
      sessionStartedRef.current = false; // Reset flag on error
    }
  }, [authData.isAuthenticated, options.gameId, options.gameVersion, options.onSessionStart, iframeRef]);

  // Handle checkpoint from game
  const handleCheckpoint = useCallback(async (checkpoint: any, events?: any[]) => {
    if (!currentSession) return;

    try {
      const response = await fetch('/api/games/checkpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: currentSession.sessionToken,
          checkpoint,
          events: events || []
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setGameStats(prev => ({
          ...prev,
          checkpointsReceived: prev.checkpointsReceived + 1,
          honeypotEvents: prev.honeypotEvents + (data.honeypotDetected ? 1 : 0),
          sessionValid: data.sessionValid
        }));

        if (data.honeypotDetected) {
          options.onHoneypotDetected?.(checkpoint.event);
        }

        options.onCheckpoint?.(checkpoint);
      }
    } catch (error) {
      console.error('Failed to process checkpoint:', error);
    }
  }, [currentSession, options]);

  // End game session
  const endGameSession = useCallback(async (finalScore: number, metadata?: any) => {
    if (!currentSession) return;

    try {
      const response = await fetch('/api/games/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: currentSession.sessionToken,
          finalScore,
          metadata
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setCurrentSession(null);
        sessionStartedRef.current = false; // Reset session flag
        authSentRef.current = false; // Reset auth flag
        setGameStats({
          checkpointsReceived: 0,
          honeypotEvents: 0,
          sessionValid: true
        });

        options.onSessionEnd?.({
          finalScore: data.finalScore,
          isValid: data.isValid
        });
      }
    } catch (error) {
      console.error('Failed to end game session:', error);
    }
  }, [currentSession, options]);

  // Listen for messages from game
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

      // Only process messages with a type from game origins
      if (!event.data.type) {
        return;
      }

      // Only process messages from game origins
      if (event.origin !== 'http://localhost:9002' && 
          event.origin !== 'http://localhost:9003' && 
          event.origin !== 'https://hyppie-road.vercel.app') {
        return;
      }

      console.log('🎮 [DAPP] Received message from game:', event.data, 'origin:', event.origin);
      
      const message = event.data as GameMessage;
      
      switch (message.type) {
        case 'GAME_CHECKPOINT':
          console.log('📍 [DAPP] Processing checkpoint:', message.payload);
          handleCheckpoint(message.payload.checkpoint, message.payload.events);
          break;
        
        case 'GAME_SESSION_END':
          console.log('🏁 [DAPP] Processing session end:', message.payload);
          endGameSession(message.payload.finalScore, message.payload.metadata);
          break;
        
        case 'HONEYPOT_TRIGGER':
          console.log('🍯 [DAPP] Honeypot triggered:', message.payload);
          setGameStats(prev => ({
            ...prev,
            honeypotEvents: prev.honeypotEvents + 1
          }));
          options.onHoneypotDetected?.(message.payload.event);
          break;
        
        default:
          console.log('🔄 [DAPP] Ignored message type:', message.type);
          break;
      }
    };

    console.log('🎧 [DAPP] Starting to listen for game messages...');
    window.addEventListener('message', handleMessage);
    return () => {
      console.log('🔇 [DAPP] Stopped listening for game messages');
      window.removeEventListener('message', handleMessage);
    };
  }, [handleCheckpoint, endGameSession, options]);

  // Initialize connection only once when iframe is ready and user is authenticated
  useEffect(() => {
    // Only initialize once
    if (initializedRef.current) {
      return;
    }

    // Wait for iframe to be available and user to be authenticated
    if (!iframeRef.current || !authData.isAuthenticated || !authData.user?.id) {
      return;
    }

    // Mark as initialized
    initializedRef.current = true;

    const sendAuthAndStartSession = () => {
      if (authSentRef.current) {
        return; // Already sent auth data
      }

      authSentRef.current = true;
      
      const message: GameMessage = {
        type: 'AUTH_STATE_CHANGED',
        payload: authData,
      };
      
      console.log('🔐 [DAPP] Sending auth data:', message);
      // Send to all possible game origins
      const gameOrigins = ['http://localhost:9002', 'http://localhost:9003', 'https://hyppie-road.vercel.app'];
      gameOrigins.forEach(origin => {
        iframeRef.current?.contentWindow?.postMessage(message, origin);
      });
      
      // Auto-start session if user is authenticated
      if (authData.user?.id) {
        console.log('🚀 [DAPP] Auto-starting session for user:', authData.user.id);
        startGameSession(authData.user.id);
      }
    };

    // Try to send immediately
    sendAuthAndStartSession();
    
    // Also set up onload handler as backup
    console.log('🔐 [DAPP] Setting up iframe onload handler for auth');
    iframeRef.current.onload = sendAuthAndStartSession;
    
    // Additional backup: try again after a short delay
    setTimeout(() => {
      if (iframeRef.current && !authSentRef.current) {
        console.log('🔐 [DAPP] Backup: sending auth data after delay');
        sendAuthAndStartSession();
      }
    }, 1000);
  }, [iframeRef, authData.isAuthenticated, authData.user?.id, startGameSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionStartedRef.current = false;
      authSentRef.current = false;
      initializedRef.current = false;
    };
  }, []);

  return {
    currentSession,
    gameStats,
    startGameSession,
    endGameSession,
    isSessionActive: !!currentSession
  };
}