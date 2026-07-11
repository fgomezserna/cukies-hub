import { useEffect, useState, useCallback, useRef } from 'react';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import { resolveParentOrigin } from '../lib/multiplayer-client';

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

export interface SessionData {
  gameId: string;
  sessionId: string;
  gameVersion?: string;
  roomId?: string;
  userId?: string;
}

/**
 * Hook for Pusher communication from game side
 * Replaces the postMessage communication with reliable WebSockets
 */
export function usePusherConnection() {
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [hasParentHandshake, setHasParentHandshake] = useState(false);

  // Ref to track cleanup timeout
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // The iframe only receives an opaque session id. The bearer remains in the parent dapp.
  const [sessionData, setSessionData] = useState<SessionData | null>(null);

  // Refs to prevent stale closures
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const sessionDataRef = useRef<SessionData | null>(sessionData);
  const pusherSessionIdRef = useRef<string | null>(null);
  const isConnectingRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const gameEndRetryTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const clearGameEndRetries = useCallback(() => {
    for (const timeout of gameEndRetryTimeoutsRef.current) clearTimeout(timeout);
    gameEndRetryTimeoutsRef.current.clear();
  }, []);

  const clearSessionData = useCallback((expectedSessionId?: string) => {
    const current = sessionDataRef.current;
    if (expectedSessionId && current?.sessionId !== expectedSessionId) return;

    sessionGenerationRef.current += 1;
    clearGameEndRetries();
    localStorage.removeItem('pending-game-result');
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
    if (channelRef.current && current) {
      pusherRef.current?.unsubscribe(`private-game-session-${current.sessionId}`);
    }
    pusherRef.current?.disconnect();
    pusherRef.current = null;
    pusherSessionIdRef.current = null;
    channelRef.current = null;
    isConnectingRef.current = false;
    sessionDataRef.current = null;
    setSessionData(null);
    setPusher(null);
    setChannel(null);
    setConnectionState('disconnected');
    setHasParentHandshake(false);
  }, [clearGameEndRetries]);

  const acceptSessionData = useCallback((sessionInfo: SessionData) => {
    if (
      !sessionInfo ||
      typeof sessionInfo.sessionId !== 'string' ||
      sessionInfo.sessionId.length === 0 ||
      sessionInfo.sessionId.length > 128 ||
      sessionInfo.gameId !== 'sybil-slayer'
    ) return;
    const normalized: SessionData = {
      gameId: sessionInfo.gameId,
      sessionId: sessionInfo.sessionId,
      ...(typeof sessionInfo.gameVersion === 'string'
        ? { gameVersion: sessionInfo.gameVersion }
        : {}),
      ...(typeof sessionInfo.roomId === 'string' ? { roomId: sessionInfo.roomId } : {}),
      ...(typeof sessionInfo.userId === 'string' ? { userId: sessionInfo.userId } : {}),
    };
    const current = sessionDataRef.current;
    if (current?.sessionId !== normalized.sessionId) {
      sessionGenerationRef.current += 1;
      clearGameEndRetries();
      localStorage.removeItem('pending-game-result');
      if (channelRef.current && current) {
        pusherRef.current?.unsubscribe(`private-game-session-${current.sessionId}`);
      }
      pusherRef.current?.disconnect();
      pusherRef.current = null;
      pusherSessionIdRef.current = null;
      channelRef.current = null;
      isConnectingRef.current = false;
      setPusher(null);
      setChannel(null);
      setConnectionState('disconnected');
    }
    const next = current?.sessionId === normalized.sessionId
      ? { ...current, ...normalized }
      : normalized;

    sessionDataRef.current = next;
    setSessionData(next);
  }, [clearGameEndRetries]);

  useEffect(() => {
    localStorage.removeItem('pusher-game-session');
    const pendingResult = localStorage.getItem('pending-game-result');
    if (!pendingResult) return;
    try {
      const parsed = JSON.parse(pendingResult) as Record<string, unknown>;
      if ('sessionToken' in parsed) {
        const { sessionToken: _discardedBearer, ...tokenlessResult } = parsed;
        localStorage.setItem('pending-game-result', JSON.stringify(tokenlessResult));
      }
    } catch {
      localStorage.removeItem('pending-game-result');
    }
  }, []);

  useEffect(() => () => clearGameEndRetries(), [clearGameEndRetries]);

  // Listen for session data from parent (dapp) via postMessage
  // This is the initial handshake - after this, everything uses Pusher
  useEffect(() => {
    const parentOrigin = getParentOrigin();
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from parent window
      if (!parentOrigin || event.source !== window.parent || event.origin !== parentOrigin) return;

      if (event.data?.type === 'SESSION_START' || event.data?.type === 'GAME_SESSION_START') {
        const sessionInfo = event.data.payload || event.data;
        console.log('🚀 [GAME-PUSHER] Session start received');
        setHasParentHandshake(true);

        const currentSessionId = sessionDataRef.current?.sessionId;
        const newSessionId = sessionInfo.sessionId;

        if (currentSessionId === newSessionId) {
          console.log('🔄 [GAME-PUSHER] Same session refreshed:', newSessionId);
        } else {
          console.log('📝 [GAME-PUSHER] New session detected, storing:', newSessionId);
        }
        acceptSessionData(sessionInfo);
      } else if (event.data?.type === 'GAME_SESSION_CLEAR') {
        const sessionId = typeof event.data.sessionId === 'string'
          ? event.data.sessionId
          : undefined;
        clearSessionData(sessionId);
      }
    };

    // Send ready signal to parent
    const sendReadySignal = () => {
      if (!parentOrigin) return;
      console.log('📡 [GAME-PUSHER] Sending ready signal to parent');
      window.parent?.postMessage({
        type: 'GAME_READY',
        gameId: 'sybil-slayer',
        timestamp: Date.now()
      }, parentOrigin);
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
  }, [acceptSessionData, clearSessionData]);

  // Connect to Pusher when we have session data
  const connectionSessionId = sessionData?.sessionId ?? null;
  useEffect(() => {
    const sessionData = sessionDataRef.current;
    if (!sessionData) {
      console.log('🔄 [GAME-PUSHER] Waiting for session data...');
      return;
    }
    if (sessionData.sessionId !== connectionSessionId) return;

    // Prevent duplicate connections - más estricto
    if (pusherSessionIdRef.current === sessionData.sessionId && pusherRef.current) {
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

    // Cancel any pending cleanup
    if (cleanupTimeoutRef.current) {
      console.log('🚫 [GAME-PUSHER] Cancelling pending delayed cleanup');
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }

    // Cleanup existing connection
    if (pusherRef.current) {
      console.log('🧹 [GAME-PUSHER] Cleaning up existing connection');
      pusherRef.current.disconnect();
      console.log('🧹 [GAME-PUSHER] Clearing refs (immediate cleanup)');
      pusherRef.current = null;
      pusherSessionIdRef.current = null;
      channelRef.current = null;
    }

    // Add a small delay to prevent rapid reconnections
    const connectTimeout = setTimeout(() => {
      console.log('🔗 [GAME-PUSHER] Connecting to Pusher with session:', sessionData.sessionId);
      isConnectingRef.current = true;
      setConnectionState('connecting');

      connectToPusher();
    }, 100); // Reduced delay from 500ms to 100ms

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
                });

                const parentOrigin = getParentOrigin();
                if (!parentOrigin) {
                  callback(new Error('Secure parent origin unavailable'), null);
                  return;
                }

                const authId = typeof window.crypto.randomUUID === 'function'
                  ? window.crypto.randomUUID()
                  : Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
                    byte.toString(16).padStart(2, '0')).join('');
                let settled = false;
                let timeoutId: ReturnType<typeof setTimeout> | null = null;

                const settle = (
                  error: Error | null,
                  authData?: { auth: string; channel_data?: string; shared_secret?: string },
                ) => {
                  if (settled) return;
                  settled = true;
                  if (timeoutId) clearTimeout(timeoutId);
                  window.removeEventListener('message', handleAuthResponse);
                  callback(error, error ? null : (authData ?? null));
                };

                // Set up listener for auth response
                const handleAuthResponse = (event: MessageEvent) => {
                  if (event.source !== window.parent || event.origin !== parentOrigin) return;

                  if (event.data?.type === 'PUSHER_AUTH_RESPONSE' && event.data?.authId === authId) {
                    if (
                      event.data.success === true &&
                      event.data.authData &&
                      typeof event.data.authData.auth === 'string'
                    ) {
                      console.log('✅ [GAME-PUSHER] Auth successful via postMessage');
                      settle(null, event.data.authData);
                    } else {
                      settle(new Error('Pusher authorization failed'));
                    }
                  }
                };

                window.addEventListener('message', handleAuthResponse);
                window.parent?.postMessage({
                  type: 'PUSHER_AUTH_REQUEST',
                  authId,
                  socketId,
                  channelName: channel.name,
                }, parentOrigin);

                timeoutId = setTimeout(() => {
                  settle(new Error('Pusher authorization timed out'));
                }, 10_000);
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

        // Assign channel ref immediately so it's available even if subscription is pending
        channelRef.current = gameChannel;
        sessionDataRef.current = sessionData;

        // Handle subscription events
        gameChannel.bind('pusher:subscription_succeeded', () => {
          console.log('✅ [GAME-PUSHER] Subscribed to channel:', channelName);
          isConnectingRef.current = false;
          setConnectionState('connected');

          // Ensure refs are still set (they should be, but double-check)
          if (!channelRef.current) {
            channelRef.current = gameChannel;
          }
          if (!sessionDataRef.current) {
            sessionDataRef.current = sessionData;
          }

          // Notify dapp that game is ready
          gameChannel.trigger('client-game-ready', {
            gameId: sessionData.gameId,
            timestamp: Date.now()
          });

          // Check for pending game results and send them
          const pendingResult = localStorage.getItem('pending-game-result');
          if (pendingResult) {
            try {
              const parsed = JSON.parse(pendingResult) as Record<string, unknown>;
              const { sessionToken: _discardedBearer, sessionId, ...gameResult } = parsed;
              if (sessionId !== sessionData.sessionId) {
                console.warn('⚠️ [GAME-PUSHER] Discarding pending result for another session');
                localStorage.removeItem('pending-game-result');
                return;
              }
              console.log('🔄 [GAME-PUSHER] Found pending game result, sending');

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
          console.log('🚀 [GAME-PUSHER] Session start received via Pusher');

          const currentSessionId = sessionDataRef.current?.sessionId;
          const newSessionId = data.sessionId;

          if (currentSessionId === newSessionId) {
            console.log('🔄 [GAME-PUSHER] Same session refreshed via Pusher:', newSessionId);
            acceptSessionData(data);
          }
        });

        // NEW: Listen for game commands from dapp
        gameChannel.bind('client-game-command', (data: any) => {
          console.log('🎮 [GAME-PUSHER] Game command received:', data);
          // This can be used for pause/resume, reset, etc.
        });

        gameChannel.bind('pusher:subscription_error', (error: any) => {
          console.error('❌ [GAME-PUSHER] Subscription error:', error);
          console.error('❌ [GAME-PUSHER] Subscription error details:', {
            error,
            channelName,
            pusherState: pusherInstance.connection.state
          });
          isConnectingRef.current = false;
          setConnectionState('disconnected');
          // Don't clear channelRef on error - keep it for retry attempts
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

        // Update refs and state (channelRef already set above, but ensure everything is consistent)
        pusherRef.current = pusherInstance;
        pusherSessionIdRef.current = sessionData.sessionId;
        if (!channelRef.current) {
          channelRef.current = gameChannel;
        }
        if (!sessionDataRef.current) {
          sessionDataRef.current = sessionData;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = (gameChannel as any).state;
        console.log('🔗 [GAME-PUSHER] Channel assigned to ref:', {
          hasChannel: !!channelRef.current,
          channelName: gameChannel.name,
          sessionId: sessionData.sessionId,
          channelState: state
        });

        setPusher(pusherInstance);
        setChannel(gameChannel);

      } catch (error) {
        console.error('❌ [GAME-PUSHER] Error connecting:', error);
        isConnectingRef.current = false;
        setConnectionState('disconnected');
      }
    };

    // Cleanup function - delayed cleanup to allow game end to complete
    return () => {
      clearTimeout(connectTimeout);
      console.log('🔌 [GAME-PUSHER] Cleanup requested');
      isConnectingRef.current = false;

      // Cancel any pending cleanup
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }

      // Delay cleanup to allow pending game end operations to complete
      cleanupTimeoutRef.current = setTimeout(() => {
        console.log('🧹 [GAME-PUSHER] Delayed cleanup starting...');

        if (channelRef.current && sessionDataRef.current) {
          const channelName = `private-game-session-${sessionData.sessionId}`;
          pusherRef.current?.unsubscribe(channelName);
        }

        if (pusherRef.current) {
          pusherRef.current.disconnect();
        }

        console.log('🧹 [GAME-PUSHER] Clearing all refs');
        pusherRef.current = null;
        pusherSessionIdRef.current = null;
        channelRef.current = null;
        sessionDataRef.current = null;

        setPusher(null);
        setChannel(null);
        setConnectionState('disconnected');
        cleanupTimeoutRef.current = null;
      }, 2000); // 2 second delay to allow game end to complete
    };

  }, [acceptSessionData, connectionSessionId]);

  // Send checkpoint to dapp
  const sendCheckpoint = useCallback((checkpointData: Omit<GameCheckpoint, 'timestamp'>) => {
    console.log('🔍 [GAME-PUSHER] Checkpoint attempt - channel status:', {
      hasChannel: !!channelRef.current,
      connectionState,
      isConnected: connectionState === 'connected',
      hasSessionData: !!sessionDataRef.current
    });

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
  }, [connectionState]);

  // Send game end to dapp with retry logic
  const sendGameEnd = useCallback((endData: Omit<GameEndData, 'timestamp'>) => {
    const sessionIdSnapshot = sessionDataRef.current?.sessionId;
    if (!sessionIdSnapshot) {
      console.warn('⚠️ [GAME-PUSHER] Cannot send game end - missing session data');
      return false;
    }
    const generationSnapshot = sessionGenerationRef.current;

    const gameEndData: GameEndData = {
      ...endData,
      gameTime: endData.gameTime
    };

    const persistPendingResult = () => {
      if (
        sessionGenerationRef.current !== generationSnapshot ||
        sessionDataRef.current?.sessionId !== sessionIdSnapshot
      ) return;
      localStorage.setItem('pending-game-result', JSON.stringify({
        ...gameEndData,
        sessionId: sessionIdSnapshot,
        timestamp: Date.now(),
      }));
    };

    const isCurrentSession = () => (
      sessionGenerationRef.current === generationSnapshot &&
      sessionDataRef.current?.sessionId === sessionIdSnapshot
    );

    const scheduleRetry = (callback: () => void, delayMs: number) => {
      const timeout = setTimeout(() => {
        gameEndRetryTimeoutsRef.current.delete(timeout);
        if (isCurrentSession()) callback();
      }, delayMs);
      gameEndRetryTimeoutsRef.current.add(timeout);
    };

    const handleGameEndFailure = () => {
      if (!isCurrentSession()) return false;
      console.error('❌ [GAME-PUSHER] All parent-proxied attempts failed; persisting tokenless result');
      persistPendingResult();
      return false;
    };

    const attemptSend = (attempt = 1, maxAttempts = 5) => {
      if (!isCurrentSession()) return false;
      console.log(`🔍 [GAME-PUSHER] Game end attempt ${attempt} - channel status:`, {
        hasChannel: !!channelRef.current,
        hasPusher: !!pusherRef.current,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channelState: channelRef.current ? (channelRef.current as any).state : 'none',
        connectionState,
        hasSessionData: !!sessionDataRef.current
      });

      // Try to reconnect channel if we have pusher but no channel
      if (!channelRef.current && pusherRef.current) {
        console.log('🔄 [GAME-PUSHER] Attempting to reconnect channel for game end');
        try {
          const channelName = `private-game-session-${sessionIdSnapshot}`;
          const newChannel = pusherRef.current.subscribe(channelName);

          // Wait a bit for subscription to be ready
          scheduleRetry(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((newChannel as any).state === 'subscribed' || (newChannel as any).subscribed) {
              channelRef.current = newChannel;
              console.log('✅ [GAME-PUSHER] Channel reconnected, retrying game end');
              attemptSend(attempt, maxAttempts);
            } else {
              console.warn('⚠️ [GAME-PUSHER] Channel reconnection failed, continuing with retry logic');
              if (attempt < maxAttempts) {
                scheduleRetry(() => attemptSend(attempt + 1, maxAttempts), 1000);
              } else {
                handleGameEndFailure();
              }
            }
          }, 500);
          return;
        } catch (error) {
          console.error('❌ [GAME-PUSHER] Failed to reconnect channel:', error);
        }
      }

      if (!channelRef.current) {
        console.warn(`⚠️ [GAME-PUSHER] Cannot send game end (attempt ${attempt}) - no channel connection`);

        if (attempt < maxAttempts) {
          console.log(`🔄 [GAME-PUSHER] Retrying game end in 1s (attempt ${attempt + 1}/${maxAttempts})`);
          scheduleRetry(() => attemptSend(attempt + 1, maxAttempts), 1000);
          return;
        } else {
          handleGameEndFailure();
          return false;
        }
      }

      try {
        channelRef.current.trigger('client-game-end', gameEndData);
        console.log(`📤 [GAME-PUSHER] Game end sent successfully (attempt ${attempt})`);

        // Clear any pending result from localStorage
        localStorage.removeItem('pending-game-result');
        return true;
      } catch (error) {
        console.error(`❌ [GAME-PUSHER] Failed to send game end (attempt ${attempt}):`, error);

        if (attempt < maxAttempts) {
          console.log(`🔄 [GAME-PUSHER] Retrying game end in 1s (attempt ${attempt + 1}/${maxAttempts})`);
          scheduleRetry(() => attemptSend(attempt + 1, maxAttempts), 1000);
        } else {
          handleGameEndFailure();
        }
        return false;
      }
    };

    return attemptSend();
  }, [connectionState]);

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
    hasParentHandshake,

    // Communication methods
    sendCheckpoint,
    sendGameEnd,
    sendHoneypotTrigger,
    startCheckpointInterval,

    // Low-level access
    pusher,
    channel,
  };
}

// Helper function to determine parent origin
function getParentOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return resolveParentOrigin(
      document.referrer,
      process.env.NEXT_PUBLIC_DAPP_ORIGIN,
      process.env.NEXT_PUBLIC_PARENT_URL,
      process.env.NODE_ENV,
    );
  } catch {
    console.error('❌ [GAME-PUSHER] Secure parent origin unavailable');
    return null;
  }
}
