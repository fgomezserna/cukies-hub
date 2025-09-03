import { useEffect, RefObject, useCallback, useState, useRef } from 'react';
import { usePusherGameConnection } from './use-pusher-game-connection';

// Game connection options (kept for compatibility)
type GameConnectionOptions = {
  gameId: string;
  gameVersion?: string;
  onSessionStart?: (sessionData: { sessionToken: string; sessionId: string }) => void;
  onCheckpoint?: (checkpoint: any) => void;
  onSessionEnd?: (result: { finalScore: number; isValid: boolean }) => void;
  onHoneypotDetected?: (event: string) => void;
};

/**
 * Enhanced hook for game-to-parent communication using Pusher WebSockets
 * Replaced the secure postMessage system with robust Pusher communication
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
  const initializedRef = useRef(false);

  // Use the robust Pusher connection system
  const {
    channel,
    connectionState,
    gameStats: pusherGameStats,
    isConnected,
    notifySessionStart,
    sendGameCommand,
    sendSessionUpdate
  } = usePusherGameConnection(
    currentSession?.sessionId || null,
    authData,
    {
      gameId: options.gameId,
      gameVersion: options.gameVersion,
      onSessionStart: options.onSessionStart,
      onCheckpoint: options.onCheckpoint,
      onSessionEnd: options.onSessionEnd,
      onHoneypotDetected: options.onHoneypotDetected
    }
  );

  // Update stats from Pusher system
  useEffect(() => {
    setGameStats(prev => ({
      ...prev,
      checkpointsReceived: pusherGameStats.checkpointsReceived,
      honeypotEvents: pusherGameStats.honeypotEvents,
      sessionValid: pusherGameStats.sessionValid
    }));
  }, [pusherGameStats]);

  // Start a new game session
  const startGameSession = useCallback(async (userId: string) => {
    console.log('🎯 [DAPP-PUSHER] startGameSession called with:', { 
      userId, 
      authenticated: authData.isAuthenticated, 
      gameId: options.gameId,
      sessionStarted: sessionStartedRef.current,
      initialized: initializedRef.current
    });
    
    if (!authData.isAuthenticated || !userId) {
      console.warn('⚠️ [DAPP-PUSHER] Cannot start session - not authenticated or no userId');
      return null;
    }

    if (sessionStartedRef.current) {
      console.log('🔄 [DAPP-PUSHER] Session already started, skipping');
      return currentSession;
    }

    try {
      // Generate session ID
      const sessionId = `game_${options.gameId}_${Date.now()}`;
      
      console.log('🚀 [DAPP-PUSHER] Creating new game session via API...');
      
      const response = await fetch('/api/games/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameId: options.gameId,
          sessionId,
          gameVersion: options.gameVersion || '1.0.0'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ [DAPP-PUSHER] Session created:', result);
        
        const sessionData = {
          sessionToken: result.sessionToken,
          sessionId: result.sessionId,
          gameId: result.gameId
        };

        // Store session token in localStorage for Pusher authentication
        localStorage.setItem(`session_token_${result.sessionId}`, result.sessionToken);
        console.log('💾 [DAPP-PUSHER] Session token stored in localStorage');

        setCurrentSession(sessionData);
        sessionStartedRef.current = true;

        // Send session data to game iframe via postMessage (initial handshake)
        if (iframeRef.current && iframeRef.current.contentWindow) {
          console.log('📤 [DAPP-PUSHER] Sending session data to game:', sessionData);
          iframeRef.current.contentWindow.postMessage({
            type: 'GAME_SESSION_START',
            payload: {
              ...sessionData,
              gameVersion: options.gameVersion || '1.0.0',
              user: authData.user
            }
          }, '*');
        }

        // Notify callback
        if (options.onSessionStart) {
          options.onSessionStart(sessionData);
        }

        return sessionData;
      } else {
        throw new Error(result.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('❌ [DAPP-PUSHER] Failed to start game session:', error);
      sessionStartedRef.current = false;
      return null;
    }
  }, [authData, options, iframeRef, currentSession]);

  // Handle game authentication and session start
  useEffect(() => {
    if (!authData.isAuthenticated || !authData.user?.id || sessionStartedRef.current || !initializedRef.current) {
      return;
    }

    console.log('🔐 [DAPP-PUSHER] Auto-starting session for authenticated user:', authData.user.id);
            startGameSession(authData.user.id);
  }, [authData, startGameSession]);

  // Handle iframe load and setup postMessage communication for handshake
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleIframeLoad = () => {
      console.log('🎮 [DAPP-PUSHER] Game iframe loaded, setting up communication');
      initializedRef.current = true;
      
      // Auto-start session if user is authenticated
      if (authData.isAuthenticated && authData.user?.id && !sessionStartedRef.current) {
        console.log('🚀 [DAPP-PUSHER] Auto-starting session after iframe load');
        startGameSession(authData.user.id);
      }
    };

    // Handle messages from game for handshake (before Pusher takes over)
    const handleGameMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (event.source !== iframe.contentWindow) return;

      console.log('📨 [DAPP-PUSHER] Message from game:', event.data);

      if (event.data?.type === 'GAME_READY') {
        console.log('🎮 [DAPP-PUSHER] Game is ready, can send session data');
        
        // Send session data if we have it
        if (currentSession && iframe.contentWindow) {
          console.log('📤 [DAPP-PUSHER] Sending session data to game:', currentSession);
          iframe.contentWindow.postMessage({
            type: 'GAME_SESSION_START',
            payload: {
              ...currentSession,
              gameVersion: options.gameVersion || '1.0.0',
              user: authData.user
            }
          }, '*');
        }
      }

      // Handle Pusher auth requests from the game
      if (event.data?.type === 'PUSHER_AUTH_REQUEST') {
        console.log('🔐 [DAPP-PUSHER] Handling Pusher auth request:', event.data.authId);
        
        // Use URLSearchParams for better compatibility
        const params = new URLSearchParams();
        params.append('socket_id', event.data.socketId);
        params.append('channel_name', event.data.channelName);
        params.append('session_token', event.data.sessionToken);

        fetch('/api/pusher/auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        })
          .then(async response => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
          })
          .then(data => {
            console.log('✅ [DAPP-PUSHER] Auth successful, sending to game');
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'PUSHER_AUTH_RESPONSE',
                authId: event.data.authId,
                success: true,
                authData: data
              }, '*');
            }
          })
          .catch(error => {
            console.error('❌ [DAPP-PUSHER] Auth failed:', error);
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'PUSHER_AUTH_RESPONSE',
                authId: event.data.authId,
                success: false,
                error: error.message
              }, '*');
            }
          });
      }
    };

    iframe.addEventListener('load', handleIframeLoad);
    window.addEventListener('message', handleGameMessage);

    return () => {
      iframe.removeEventListener('load', handleIframeLoad);
      window.removeEventListener('message', handleGameMessage);
    };
  }, [iframeRef, authData, options, currentSession, startGameSession]);

  // Reset session when user changes
  useEffect(() => {
    if (!authData.isAuthenticated) {
      console.log('🔄 [DAPP-PUSHER] User logged out, resetting session');
      setCurrentSession(null);
      sessionStartedRef.current = false;
      initializedRef.current = false;
    }
  }, [authData.isAuthenticated]);

  return {
    // Session state
    currentSession,
    isSessionActive: !!currentSession,
    
    // Connection state from Pusher
    connectionState,
    isConnected,
    
    // Game stats
    gameStats,
    
    // Session management
    startGameSession,
    
    // Additional utilities
    sendGameCommand,
    sendSessionUpdate
  };
}