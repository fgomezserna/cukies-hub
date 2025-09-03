import { useEffect, useState, useCallback, useRef } from 'react';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';

// Enable pusher logging for development
if (process.env.NODE_ENV === 'development') {
  Pusher.logToConsole = true;
}

interface GameCheckpoint {
  score: number;
  gameTime: number;
  timestamp: number;
  nonce?: string;
  hash?: string;
  events?: any[];
}

interface GameEndData {
  finalScore: number;
  gameTime: number;
  metadata?: any;
}

interface SessionData {
  gameId: string;
  sessionToken: string;
  sessionId: string;
  gameVersion?: string;
}

/**
 * Hook for Pusher communication from game side
 * Replaces the postMessage communication with reliable WebSockets
 */
export function usePusherConnection() {
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Initialize session data from localStorage if available
  const [sessionData, setSessionData] = useState<SessionData | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pusher-game-session');
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  // Refs to prevent stale closures
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const sessionDataRef = useRef<SessionData | null>(sessionData);
  const isConnectingRef = useRef(false);

  // Listen for session data from parent (dapp) via postMessage
  // This is the initial handshake - after this, everything uses Pusher
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from parent window
      if (event.source !== window.parent) return;

      console.log('📨 [GAME-PUSHER] Message from parent:', event.data);

      if (event.data?.type === 'SESSION_START' || event.data?.type === 'GAME_SESSION_START') {
        const sessionInfo = event.data.payload || event.data;
        console.log('🚀 [GAME-PUSHER] Session start received:', sessionInfo);
        
        // Store in localStorage for persistence ONLY if it's a new session
        const currentSessionId = sessionDataRef.current?.sessionId;
        const newSessionId = sessionInfo.sessionId;
        
        if (currentSessionId !== newSessionId) {
          console.log('📝 [GAME-PUSHER] New session detected, storing:', newSessionId);
          localStorage.setItem('pusher-game-session', JSON.stringify(sessionInfo));
          setSessionData(sessionInfo);
        } else {
          console.log('🔄 [GAME-PUSHER] Same session received, ignoring:', newSessionId);
        }
      }
    };

    // Send ready signal to parent
    const sendReadySignal = () => {
      console.log('📡 [GAME-PUSHER] Sending ready signal to parent');
      window.parent?.postMessage({ 
        type: 'GAME_READY', 
        gameId: 'sybil-slayer',
        timestamp: Date.now()
      }, '*');
    };

    // Send ready signal after component mounts (only once with retry)
    let readySent = false;
    const sendOnce = () => {
      if (!readySent) {
        sendReadySignal();
        readySent = true;
      }
    };
    
    sendOnce();
    // Single retry after delay if needed
    setTimeout(sendOnce, 1000);

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Connect to Pusher when we have session data
  useEffect(() => {
    if (!sessionData) {
      console.log('🔄 [GAME-PUSHER] Waiting for session data...');
      return;
    }

    // Prevent duplicate connections - más estricto
    if (sessionDataRef.current?.sessionId === sessionData.sessionId && pusherRef.current) {
      console.log('🔄 [GAME-PUSHER] Already connected to session:', sessionData.sessionId, 'State:', connectionState);
      return;
    }

    // Prevent concurrent connections
    if (isConnectingRef.current) {
      console.log('🔄 [GAME-PUSHER] Connection already in progress...');
      return;
    }

    console.log('🎯 [GAME-PUSHER] Connection decision:', {
      hasSessionData: !!sessionData,
      sessionId: sessionData.sessionId,
      currentSessionId: sessionDataRef.current?.sessionId,
      hasPusher: !!pusherRef.current,
      connectionState,
      isConnecting: isConnectingRef.current
    });

    // Cleanup existing connection
    if (pusherRef.current) {
      console.log('🧹 [GAME-PUSHER] Cleaning up existing connection');
      pusherRef.current.disconnect();
      pusherRef.current = null;
      channelRef.current = null;
    }

    // Add a small delay to prevent rapid reconnections
    const connectTimeout = setTimeout(() => {
      console.log('🔗 [GAME-PUSHER] Connecting to Pusher with session:', sessionData.sessionId);
      isConnectingRef.current = true;
      setConnectionState('connecting');
      
      connectToPusher();
    }, 500);

    const connectToPusher = () => {
      try {
        // Create Pusher instance
        const pusherInstance = new Pusher(
          process.env.NEXT_PUBLIC_PUSHER_KEY!,
        {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
          forceTLS: true,
          authorizer: (channel, options) => ({
            authorize: (socketId, callback) => {
              console.log('📤 [GAME-PUSHER] Requesting auth via postMessage:', {
                socketId: socketId.substring(0, 12) + '...',
                channelName: channel.name,
                sessionToken: sessionData.sessionToken.substring(0, 12) + '...'
              });

              // Use postMessage to request auth from parent instead of direct fetch
              const authId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              
              // Set up listener for auth response
              const handleAuthResponse = (event: MessageEvent) => {
                if (event.source !== window.parent) return;
                
                if (event.data?.type === 'PUSHER_AUTH_RESPONSE' && event.data?.authId === authId) {
                  window.removeEventListener('message', handleAuthResponse);
                  
                  if (event.data.success) {
                    console.log('✅ [GAME-PUSHER] Auth successful via postMessage');
                    callback(null, event.data.authData);
                  } else {
                    console.error('❌ [GAME-PUSHER] Auth failed via postMessage:', event.data.error);
                    callback(new Error(event.data.error), null);
                  }
                }
              };
              
              window.addEventListener('message', handleAuthResponse);
              
              // Send auth request to parent
              window.parent?.postMessage({
                type: 'PUSHER_AUTH_REQUEST',
                authId,
                socketId,
                channelName: channel.name,
                sessionToken: sessionData.sessionToken
              }, '*');
              
              // Timeout fallback
              setTimeout(() => {
                window.removeEventListener('message', handleAuthResponse);
                callback(new Error('Auth request timeout'), null);
              }, 10000);
            }
          })
        }
      );

      // Connection event handlers
      pusherInstance.connection.bind('connected', () => {
        console.log('✅ [GAME-PUSHER] Connected to Pusher');
      });

      pusherInstance.connection.bind('disconnected', () => {
        console.log('🔌 [GAME-PUSHER] Disconnected from Pusher');
        setConnectionState('disconnected');
      });

      pusherInstance.connection.bind('error', (error: any) => {
        console.error('❌ [GAME-PUSHER] Connection error:', error);
        setConnectionState('disconnected');
      });

      // Subscribe to game session channel
      const channelName = `private-game-session-${sessionData.sessionId}`;
      const gameChannel = pusherInstance.subscribe(channelName);

      // Handle subscription events
      gameChannel.bind('pusher:subscription_succeeded', () => {
        console.log('✅ [GAME-PUSHER] Subscribed to channel:', channelName);
        isConnectingRef.current = false;
        setConnectionState('connected');
        
        // Notify dapp that game is ready
        gameChannel.trigger('client-game-ready', {
          gameId: sessionData.gameId,
          timestamp: Date.now()
        });

        // Check for pending game results and send them
        const pendingResult = localStorage.getItem('pending-game-result');
        if (pendingResult) {
          try {
            const gameResult = JSON.parse(pendingResult);
            console.log('🔄 [GAME-PUSHER] Found pending game result, sending:', gameResult);
            
            gameChannel.trigger('client-game-end', gameResult);
            localStorage.removeItem('pending-game-result');
            console.log('✅ [GAME-PUSHER] Pending game result sent successfully');
          } catch (error) {
            console.error('❌ [GAME-PUSHER] Failed to send pending game result:', error);
          }
        }
      });

      // NEW: Listen for session updates from dapp via Pusher
      gameChannel.bind('client-session-start', (data: any) => {
        console.log('🚀 [GAME-PUSHER] Session start received via Pusher:', data);
        
        const currentSessionId = sessionDataRef.current?.sessionId;
        const newSessionId = data.sessionId;
        
        if (currentSessionId !== newSessionId) {
          console.log('📝 [GAME-PUSHER] New session detected via Pusher, storing:', newSessionId);
          localStorage.setItem('pusher-game-session', JSON.stringify(data));
          setSessionData(data);
        } else {
          console.log('🔄 [GAME-PUSHER] Same session received via Pusher, ignoring:', newSessionId);
        }
      });

      // NEW: Listen for game commands from dapp
      gameChannel.bind('client-game-command', (data: any) => {
        console.log('🎮 [GAME-PUSHER] Game command received:', data);
        // This can be used for pause/resume, reset, etc.
      });

      gameChannel.bind('pusher:subscription_error', (error: any) => {
        console.error('❌ [GAME-PUSHER] Subscription error:', error);
        isConnectingRef.current = false;
        setConnectionState('disconnected');
      });

      // Listen for session start confirmation from dapp
      gameChannel.bind('client-session-start', (data: any) => {
        console.log('📍 [GAME-PUSHER] Session start confirmed:', data);
        // Session is now fully active
      });

      gameChannel.bind('client-dapp-ready', (data: any) => {
        console.log('📱 [GAME-PUSHER] Dapp ready signal:', data);
        // Dapp is ready to receive events
      });

        // Update refs and state
        pusherRef.current = pusherInstance;
        channelRef.current = gameChannel;
        sessionDataRef.current = sessionData;
        
        setPusher(pusherInstance);
        setChannel(gameChannel);

      } catch (error) {
        console.error('❌ [GAME-PUSHER] Error connecting:', error);
        isConnectingRef.current = false;
        setConnectionState('disconnected');
      }
    };

    // Cleanup function
    return () => {
      clearTimeout(connectTimeout);
      console.log('🔌 [GAME-PUSHER] Cleaning up connection');
      isConnectingRef.current = false;
      
      if (channelRef.current && sessionDataRef.current) {
        const channelName = `private-game-session-${sessionDataRef.current.sessionId}`;
        pusherRef.current?.unsubscribe(channelName);
      }
      
      if (pusherRef.current) {
        pusherRef.current.disconnect();
      }
      
      pusherRef.current = null;
      channelRef.current = null;
      sessionDataRef.current = null;
      
      setPusher(null);
      setChannel(null);
      setConnectionState('disconnected');
    };

  }, [sessionData]);

  // Send checkpoint to dapp
  const sendCheckpoint = useCallback((checkpointData: Omit<GameCheckpoint, 'timestamp'>) => {
    if (!channelRef.current) {
      console.warn('⚠️ [GAME-PUSHER] Cannot send checkpoint - no channel connection');
      return false;
    }

    const checkpoint: GameCheckpoint = {
      ...checkpointData,
      timestamp: Date.now()
    };

    try {
      channelRef.current.trigger('client-checkpoint', checkpoint);
      console.log('📤 [GAME-PUSHER] Checkpoint sent:', checkpoint);
      return true;
    } catch (error) {
      console.error('❌ [GAME-PUSHER] Failed to send checkpoint:', error);
      return false;
    }
  }, []);

  // Send game end to dapp with retry logic
  const sendGameEnd = useCallback((endData: Omit<GameEndData, 'timestamp'>) => {
    const gameEndData: GameEndData = {
      ...endData,
      gameTime: endData.gameTime
    };

    const attemptSend = (attempt = 1, maxAttempts = 3) => {
      if (!channelRef.current) {
        console.warn(`⚠️ [GAME-PUSHER] Cannot send game end (attempt ${attempt}) - no channel connection`);
        
        if (attempt < maxAttempts) {
          console.log(`🔄 [GAME-PUSHER] Retrying game end in 2s (attempt ${attempt + 1}/${maxAttempts})`);
          setTimeout(() => attemptSend(attempt + 1, maxAttempts), 2000);
          return;
        } else {
          console.error('❌ [GAME-PUSHER] All game end attempts failed - storing in localStorage');
          // Store in localStorage as fallback
          localStorage.setItem('pending-game-result', JSON.stringify({
            ...gameEndData,
            sessionId: sessionDataRef.current?.sessionId,
            timestamp: Date.now()
          }));
          return false;
        }
      }

      try {
        channelRef.current.trigger('client-game-end', gameEndData);
        console.log(`📤 [GAME-PUSHER] Game end sent successfully (attempt ${attempt}):`, gameEndData);
        
        // Clear any pending result from localStorage
        localStorage.removeItem('pending-game-result');
        return true;
      } catch (error) {
        console.error(`❌ [GAME-PUSHER] Failed to send game end (attempt ${attempt}):`, error);
        
        if (attempt < maxAttempts) {
          console.log(`🔄 [GAME-PUSHER] Retrying game end in 2s (attempt ${attempt + 1}/${maxAttempts})`);
          setTimeout(() => attemptSend(attempt + 1, maxAttempts), 2000);
        } else {
          console.error('❌ [GAME-PUSHER] All game end attempts failed - storing in localStorage');
          localStorage.setItem('pending-game-result', JSON.stringify({
            ...gameEndData,
            sessionId: sessionDataRef.current?.sessionId,
            timestamp: Date.now()
          }));
        }
        return false;
      }
    };

    return attemptSend();
  }, []);

  // Send honeypot trigger to dapp
  const sendHoneypotTrigger = useCallback((event: string) => {
    if (!channelRef.current) {
      console.warn('⚠️ [GAME-PUSHER] Cannot send honeypot trigger - no channel connection');
      return false;
    }

    try {
      channelRef.current.trigger('client-honeypot-trigger', { event });
      console.log('📤 [GAME-PUSHER] Honeypot trigger sent:', event);
      return true;
    } catch (error) {
      console.error('❌ [GAME-PUSHER] Failed to send honeypot trigger:', error);
      return false;
    }
  }, []);

  // Start checkpoint interval
  const startCheckpointInterval = useCallback((
    getCurrentScore: () => number, 
    getCurrentGameTime: () => number,
    intervalMs: number = 5000
  ) => {
    const interval = setInterval(() => {
      if (connectionState === 'connected') {
        sendCheckpoint({
          score: getCurrentScore(),
          gameTime: getCurrentGameTime(),
          events: [] // Add any events if needed
        });
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [connectionState, sendCheckpoint]);

  return {
    // Connection state
    isConnected: connectionState === 'connected',
    connectionState,
    sessionData,
    
    // Communication methods
    sendCheckpoint,
    sendGameEnd,
    sendHoneypotTrigger,
    startCheckpointInterval,
    
    // Low-level access
    pusher,
    channel
  };
}

// Helper function to determine parent origin
function getParentOrigin(): string {
  if (typeof window === 'undefined') return '';
  
  // In development, always use localhost:3000 (dapp port)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 [GAME-PUSHER] Using development parent origin: http://localhost:3000');
    return 'http://localhost:3000';
  }
  
  // In production, try to detect from referrer first
  if (document.referrer) {
    try {
      const url = new URL(document.referrer);
      const parentOrigin = `${url.protocol}//${url.host}`;
      console.log('🔧 [GAME-PUSHER] Using referrer parent origin:', parentOrigin);
      return parentOrigin;
    } catch (error) {
      console.warn('⚠️ [GAME-PUSHER] Failed to parse referrer:', document.referrer, error);
    }
  }
  
  // Fallback to environment variable or default
  const fallbackOrigin = process.env.NEXT_PUBLIC_PARENT_URL || 'https://hyppieliquid.com';
  console.log('🔧 [GAME-PUSHER] Using fallback parent origin:', fallbackOrigin);
  return fallbackOrigin;
}