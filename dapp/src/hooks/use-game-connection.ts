import { useEffect, RefObject, useCallback, useState, useRef } from 'react';
import { generateCheckpointHash, generateNonce, HONEYPOT_EVENTS } from '@/lib/game-validation';
import { 
  createSecureMessage, 
  validateSecureMessage, 
  extractMessageData,
  logSecurityEvent,
  type GameMessageType 
} from '@/lib/secure-game-communication';

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

        // Send secure session data to game
        if (iframeRef.current) {
          const secureMessage = await createSecureMessage('GAME_SESSION_START', { 
            gameId: options.gameId, 
            sessionToken: data.sessionToken, 
            sessionId: data.sessionId 
          });
          
          console.log('📨 [DAPP] Sending secure session start message to game:', secureMessage);
          // Get the actual game origin from the iframe src
          const iframeSrc = iframeRef.current?.src;
          if (iframeSrc) {
            try {
              const gameUrl = new URL(iframeSrc);
              const gameOrigin = `${gameUrl.protocol}//${gameUrl.host}`;
              console.log('🎯 [DAPP] Sending message to game origin:', gameOrigin);
              iframeRef.current?.contentWindow?.postMessage(secureMessage, gameOrigin);
            } catch (e) {
              console.error('❌ [DAPP] Failed to parse iframe src:', e);
            }
          } else {
            console.warn('⚠️ [DAPP] No iframe src available');
          }
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
  const endGameSession = useCallback(async (sessionToken: string, finalScore: number, metadata?: any) => {
    console.log('🏁 [DAPP] endGameSession called with:', { sessionToken, finalScore, metadata, hasSession: !!currentSession });

    console.log('🏁 [DAPP] Ending session:', sessionToken, 'with score:', finalScore);

    try {
      const response = await fetch('/api/games/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          finalScore,
          metadata
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setCurrentSession(null);
        sessionStartedRef.current = false; // Reset session flag
        // DON'T reset authSentRef.current = false; // Keep auth flag to avoid re-sending auth
        setGameStats({
          checkpointsReceived: 0,
          honeypotEvents: 0,
          sessionValid: true
        });

        options.onSessionEnd?.({
          finalScore: data.finalScore,
          isValid: data.isValid
        });

        // Auto-start a new session for the next game
        if (authData.user?.id && authData.isAuthenticated) {
          console.log('🔄 [DAPP] Auto-starting new session after game end');
          setTimeout(() => {
            startGameSession(authData.user.id);
          }, 1000); // Wait 1 second before starting new session
        }
      }
    } catch (error) {
      console.error('Failed to end game session:', error);
    }
  }, [options, authData.user?.id, authData.isAuthenticated, startGameSession]);

  // Listen for messages from game
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

      // Only process messages with a type from game origins
      if (!event.data.type) {
        return;
      }

      // Only process messages from game origins
      const gameOrigins = [
        process.env.NEXT_PUBLIC_GAME_SYBILSLASH || 'http://localhost:9002',
        process.env.NEXT_PUBLIC_GAME_HYPPIE_ROAD || 'http://localhost:9003', 
        process.env.NEXT_PUBLIC_GAME_TOWER_BUILDER || 'http://localhost:9004'
      ].map(url => url.replace(/\/$/, '')); // Remove trailing slash
      
      if (!gameOrigins.includes(event.origin)) {
        return;
      }

      console.log('🎮 [DAPP] Received message from game:', event.data, 'origin:', event.origin);
      
      // Validate secure message
      const validation = await validateSecureMessage(event.data);
      if (!validation.isValid) {
        logSecurityEvent('Invalid message received', { 
          reason: validation.reason, 
          origin: event.origin,
          message: event.data 
        });
        return;
      }

      const message = validation.parsedMessage!;
      const messageData = extractMessageData(message);
      
      logSecurityEvent('Valid message received', { 
        type: messageData.type, 
        origin: event.origin 
      });
      
      switch (messageData.type) {
        case 'GAME_CHECKPOINT':
          console.log('📍 [DAPP] Processing secure checkpoint:', messageData.payload);
          handleCheckpoint(messageData.payload.checkpoint, messageData.payload.events);
          break;
        
        case 'GAME_SESSION_END':
          console.log('🏁 [DAPP] Processing secure session end:', messageData.payload);
          endGameSession(messageData.payload.sessionToken, messageData.payload.finalScore, messageData.payload.metadata);
          break;
        
        case 'HONEYPOT_TRIGGER':
          console.log('🍯 [DAPP] Honeypot triggered:', messageData.payload);
          setGameStats(prev => ({
            ...prev,
            honeypotEvents: prev.honeypotEvents + 1
          }));
          options.onHoneypotDetected?.(messageData.payload.event);
          break;
        
        default:
          console.log('🔄 [DAPP] Ignored message type:', messageData.type);
          break;
      }
    };

    console.log('🎧 [DAPP] Starting to listen for secure game messages...');
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

    const sendAuthAndStartSession = async () => {
      if (authSentRef.current) {
        return; // Already sent auth data
      }

      // Ensure iframe is available and loaded
      if (!iframeRef.current?.contentWindow) {
        console.log('⏳ [DAPP] Iframe not ready, waiting...');
        return;
      }

      authSentRef.current = true;
      
      console.log('🔐 [DAPP] Iframe ready, sending auth data...');
      
      // Create secure auth message
      const secureAuthMessage = await createSecureMessage('AUTH_STATE_CHANGED', authData);
      
      console.log('🔐 [DAPP] Sending secure auth data:', secureAuthMessage);
      // Send to all possible game origins
      const gameOrigins = [
        process.env.NEXT_PUBLIC_GAME_SYBILSLASH || 'http://localhost:9002',
        process.env.NEXT_PUBLIC_GAME_HYPPIE_ROAD || 'http://localhost:9003', 
        process.env.NEXT_PUBLIC_GAME_TOWER_BUILDER || 'http://localhost:9004'
      ].map(url => url.replace(/\/$/, '')); // Remove trailing slash
      gameOrigins.forEach(origin => {
        try {
          iframeRef.current?.contentWindow?.postMessage(secureAuthMessage, origin);
          console.log('📨 [DAPP] Auth message sent to:', origin);
        } catch (e) {
          console.warn('⚠️ [DAPP] Failed to send auth to:', origin);
        }
      });
      
      // Wait a bit before starting session to ensure auth is processed
      setTimeout(() => {
        if (authData.user?.id) {
          console.log('🚀 [DAPP] Auto-starting session for user:', authData.user.id);
          startGameSession(authData.user.id);
        }
      }, 500); // Wait 500ms for auth to be processed
    };

    // Try to send immediately
    sendAuthAndStartSession();
    
    // Also set up onload handler as backup
    console.log('🔐 [DAPP] Setting up iframe onload handler for secure auth');
    iframeRef.current.onload = sendAuthAndStartSession;
    
    // Additional backup: try again after delays
    setTimeout(() => {
      if (iframeRef.current && !authSentRef.current) {
        console.log('🔐 [DAPP] Backup 1: sending secure auth data after delay');
        sendAuthAndStartSession();
      }
    }, 1000);
    
    // Final backup after iframe should be fully loaded
    setTimeout(() => {
      if (iframeRef.current && !authSentRef.current) {
        console.log('🔐 [DAPP] Backup 2: final attempt to send auth data');
        sendAuthAndStartSession();
      }
    }, 2000);
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