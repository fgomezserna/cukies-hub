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
    console.log('🎯 [DAPP] startGameSession called with:', { 
      userId, 
      authenticated: authData.isAuthenticated, 
      gameId: options.gameId,
      sessionStarted: sessionStartedRef.current,
      initialized: initializedRef.current,
      authSent: authSentRef.current
    });
    
    if (!authData.isAuthenticated || !userId) {
      console.log('🚫 [DAPP] Cannot start session - not authenticated or no userId', { authenticated: authData.isAuthenticated, userId });
      return;
    }

    // Prevent multiple session starts
    if (sessionStartedRef.current) {
      console.log('🚫 [DAPP] Session already started, skipping...', { sessionStartedRef: sessionStartedRef.current });
      return;
    }

    sessionStartedRef.current = true;

    console.log('🚀 [DAPP] Starting game session for userId:', userId, 'gameId:', options.gameId);

    try {
      console.log('📞 [DAPP] Making API call to /api/games/start-session with:', {
        userId,
        gameId: options.gameId,
        gameVersion: options.gameVersion
      });
      
      const response = await fetch('/api/games/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          gameId: options.gameId,
          gameVersion: options.gameVersion
        })
      });

      console.log('📬 [DAPP] API response received:', { status: response.status, ok: response.ok });
      
      const data = await response.json();
      console.log('📡 [DAPP] Session API response:', data);
      
      if (data.success) {
        const sessionData = {
          sessionToken: data.sessionToken,
          sessionId: data.sessionId
        };
        
        console.log('💾 [DAPP] Setting currentSession to:', {
          sessionToken: data.sessionToken,
          sessionId: data.sessionId,
          gameId: options.gameId
        });
        
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
      console.error('❌ [DAPP] Failed to start game session:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
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

  // End game session with retry logic
  const endGameSession = useCallback(async (sessionToken: string, finalScore: number, metadata?: any, retryCount = 0) => {
    console.log('🏁 [DAPP] endGameSession called with:', { 
      sessionToken, 
      finalScore, 
      metadata, 
      retryCount,
      hasSession: !!currentSession, 
      currentSessionToken: currentSession?.sessionToken 
    });

    let actualSessionToken = sessionToken;

    // If game sent 'no-session', find the most recent active session for this user and game
    if (sessionToken === 'no-session' && authData.isAuthenticated && authData.user?.id) {
      console.log('🔍 [DAPP] Game sent no-session, finding active session via API...');
      
      try {
        const response = await fetch(`/api/games/active-session?userId=${authData.user.id}&gameId=${options.gameId}`);
        const data = await response.json();
        
        if (data.success && data.sessionToken) {
          actualSessionToken = data.sessionToken;
          console.log('✅ [DAPP] Found active session:', data.sessionToken);
        } else {
          console.log('❌ [DAPP] No active session found via API');
        }
      } catch (error) {
        console.error('❌ [DAPP] Error finding active session:', error);
      }
    }

    // Skip API call if there's no valid session at all
    if (!actualSessionToken || actualSessionToken === 'no-session') {
      console.log('⚠️ [DAPP] No valid session to end, skipping API call');
      options.onSessionEnd?.({ finalScore, isValid: false });
      return;
    }

    console.log('🏁 [DAPP] Ending session:', actualSessionToken, 'with score:', finalScore);

    try {
      const response = await fetch('/api/games/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: actualSessionToken,
          finalScore,
          metadata
        })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ [DAPP] Session ended successfully:', {
          sessionId: data.sessionId,
          finalScore: data.finalScore,
          xpEarned: data.xpEarned,
          retryCount
        });

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
      } else {
        console.error('❌ [DAPP] End session failed:', data);
        // Retry logic for failed requests (max 2 retries)
        if (retryCount < 2 && actualSessionToken !== 'no-session') {
          console.log(`🔄 [DAPP] Retrying end session (attempt ${retryCount + 1}/2)...`);
          setTimeout(() => {
            endGameSession(sessionToken, finalScore, metadata, retryCount + 1);
          }, 1000 * (retryCount + 1)); // Exponential backoff
        } else {
          console.error('❌ [DAPP] Max retries reached, giving up on ending session');
        }
      }
    } catch (error) {
      console.error('❌ [DAPP] Network error ending game session:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionToken: actualSessionToken,
        finalScore,
        retryCount
      });
      
      // Retry logic for network errors (max 2 retries)
      if (retryCount < 2 && actualSessionToken !== 'no-session') {
        console.log(`🔄 [DAPP] Retrying after network error (attempt ${retryCount + 1}/2)...`);
        setTimeout(() => {
          endGameSession(sessionToken, finalScore, metadata, retryCount + 1);
        }, 2000 * (retryCount + 1)); // Exponential backoff
      } else {
        console.error('❌ [DAPP] Max retries reached after network errors, giving up');
      }
    }
  }, [options, authData.user?.id, authData.isAuthenticated, startGameSession, currentSession]);

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

  // Initialize session when user is authenticated (don't wait for iframe)
  useEffect(() => {
    console.log('🔄 [DAPP] useEffect - Initialize connection', { 
      initialized: initializedRef.current, 
      hasIframe: !!iframeRef.current, 
      authenticated: authData.isAuthenticated, 
      userId: authData.user?.id 
    });

    // Only initialize once
    if (initializedRef.current) {
      console.log('🔄 [DAPP] Already initialized, skipping');
      return;
    }

    // Start session as soon as user is authenticated (don't wait for iframe)
    if (!authData.isAuthenticated || !authData.user?.id) {
      console.log('🔄 [DAPP] User not authenticated yet, waiting...', { 
        authenticated: authData.isAuthenticated, 
        userId: authData.user?.id 
      });
      return;
    }

    // Mark as initialized and start session immediately
    initializedRef.current = true;
    console.log('✅ [DAPP] User authenticated, starting session immediately...');
    
    // Start session immediately for authenticated user
    startGameSession(authData.user.id);
  }, [authData.isAuthenticated, authData.user?.id, startGameSession, options.gameId]);

  // Monitor currentSession changes
  useEffect(() => {
    console.log('🔄 [DAPP] currentSession state changed:', currentSession);
  }, [currentSession]);

  // Separate effect to handle iframe communication (optional - for future features)
  useEffect(() => {
    // This effect can be used later if we need to send additional data to games
    // For now, the games work independently without needing auth data from parent
    console.log('🔗 [DAPP] Iframe reference updated:', { hasIframe: !!iframeRef.current });
  }, [iframeRef?.current]);

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