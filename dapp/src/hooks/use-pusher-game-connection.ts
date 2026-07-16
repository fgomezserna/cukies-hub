import { useEffect, useState, useCallback, useRef } from 'react';
import type { Channel } from 'pusher-js';
import {
  routeGameCheckpoint,
  routeGameEnd,
  type CompetitionAttemptCoordinator,
} from '@/lib/treasure-hunt-competition/client';

interface GameCheckpoint {
  score: number;
  gameTime: number;
  timestamp: number;
  nonce?: string;
  hash?: string;
  events?: any[];
}

interface GameEndData {
  resultId?: unknown;
  finalScore: number;
  gameTime: number;
  metadata?: any;
  competitionAttemptId?: unknown;
}

interface CompletedGameEnd {
  resultId: string;
  finalScore: number;
  isValid: boolean;
  source: 'competition' | 'legacy';
  status: string | null;
  clearConfirmationRequired: boolean;
  sessionNotified: boolean;
}

interface PusherGameConnectionOptions {
  gameId: string;
  gameVersion?: string;
  competitionCoordinator?: CompetitionAttemptCoordinator;
  onSessionStart?: (sessionData: { sessionToken: string; sessionId: string }) => void;
  onCheckpoint?: (checkpoint: GameCheckpoint) => void;
  onSessionEnd?: (result: {
    resultId: string;
    finalScore: number;
    isValid: boolean;
    source: 'competition' | 'legacy';
    status: string | null;
    clearConfirmationRequired: boolean;
  }) => void;
  onGameEndPersisted?: (result: {
    resultId: string;
    clearConfirmationRequired: boolean;
  }) => boolean;
  onHoneypotDetected?: (event: string) => void;
}

/**
 * Hook for real-time game communication using Pusher WebSockets
 * Replaces the postMessage system with reliable WebSocket communication
 */
export function usePusherGameConnection(
  sessionId: string | null,
  authData: { isAuthenticated: boolean; user: any; sessionToken?: string | null },
  options: PusherGameConnectionOptions
) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [gameStats, setGameStats] = useState({
    checkpointsReceived: 0,
    honeypotEvents: 0,
    sessionValid: true
  });
  const {
    gameId,
    gameVersion,
    competitionCoordinator,
    onCheckpoint,
    onGameEndPersisted,
    onHoneypotDetected,
    onSessionEnd,
    onSessionStart,
  } = options;

  // Refs to prevent cleanup issues
  const channelRef = useRef<Channel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const customClientRef = useRef<any>(null);
  const isConnectingRef = useRef(false);
  const connectionPromiseRef = useRef<Promise<void> | null>(null);
  const processingGameEndIdsRef = useRef(new Set<string>());
  const completedGameEndsRef = useRef(new Map<string, CompletedGameEnd>());

  // Connect to Pusher channel when sessionId is available and session token exists
  useEffect(() => {
    const sessionToken = authData.sessionToken;
    if (!sessionId || !sessionToken || !authData.isAuthenticated || !authData.user?.id) {
      console.log('🔄 [PUSHER] Waiting for session and auth:', {
        hasSessionId: !!sessionId,
        isAuthenticated: authData.isAuthenticated,
        hasUserId: !!authData.user?.id
      });
      return;
    }

    // Prevent duplicate connections
    if (sessionIdRef.current === sessionId && channelRef.current && !isConnectingRef.current) {
      console.log('🔄 [PUSHER] Already connected to session:', sessionId);
      return;
    }

    // Prevent concurrent connections
    if (isConnectingRef.current || connectionPromiseRef.current) {
      console.log('🔄 [PUSHER] Connection already in progress...');
      return;
    }

    // Cleanup existing connection if any
    if (customClientRef.current || channelRef.current) {
      console.log('🧹 [PUSHER] Cleaning up existing connection before new one');
      if (customClientRef.current) {
        customClientRef.current.disconnect();
        customClientRef.current = null;
      }
      channelRef.current = null;
    }

    const channelName = `private-game-session-${sessionId}`;
    console.log('🔗 [PUSHER] Connecting to channel:', channelName, 'for sessionId:', sessionId);
    console.log('🔗 [PUSHER] Full connection details:', {
      sessionId,
      channelName,
      userId: authData.user?.id,
      isAuthenticated: authData.isAuthenticated
    });
    
    isConnectingRef.current = true;
    setConnectionState('connecting');
    
    // Create connection promise to prevent duplicates
    connectionPromiseRef.current = new Promise(async (resolve, reject) => {
      try {
      // Create a new Pusher client instance with custom authorizer for this session
      const customPusherClient = new (require('pusher-js'))(
        process.env.NEXT_PUBLIC_PUSHER_KEY!,
        {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
          forceTLS: true,
          authorizer: (channel: any, options: any) => ({
            authorize: (socketId: string, callback: (error: any, authInfo?: any) => void) => {
              console.log('🔐 [PUSHER DAPP] Custom authorization request:', {
                socketId: socketId.substring(0, 12) + '...',
                channelName: channel.name,
                sessionId
              });

              // Use URLSearchParams for better compatibility instead of FormData
              const params = new URLSearchParams();
              params.append('socket_id', socketId);
              params.append('channel_name', channel.name);
              params.append('session_token', sessionToken);

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
                  if (data.error) {
                    console.error('❌ [PUSHER DAPP] Auth failed:', data.error);
                    callback(new Error(data.error));
                  } else {
                    console.log('✅ [PUSHER DAPP] Auth successful');
                    callback(null, data);
                  }
                })
                .catch(error => {
                  console.error('❌ [PUSHER DAPP] Auth error:', error);
                  callback(error);
                });
            }
          })
        }
      );

      // Subscribe to private channel
      console.log('📡 [PUSHER] Subscribing to channel:', channelName, 'for sessionId:', sessionId);
      console.log('📡 [PUSHER] Pusher client state:', customPusherClient.connection.state);
      const newChannel = customPusherClient.subscribe(channelName);
      console.log('📡 [PUSHER] Channel subscribe called, waiting for subscription...');

      // Handle subscription success
      newChannel.bind('pusher:subscription_succeeded', () => {
        console.log('✅ [PUSHER] Successfully subscribed to:', channelName);
        console.log('✅ [PUSHER] Channel ready to receive events, sessionId:', sessionId);
        console.log('✅ [PUSHER] Channel state:', newChannel.state);
        isConnectingRef.current = false;
        setConnectionState('connected');
        
        // Store channel ref for event binding
        channelRef.current = newChannel;
        
        console.log('✅ [PUSHER] Channel ref stored, ready to receive events:', {
          channelName,
          sessionId,
          hasChannelRef: !!channelRef.current,
          channelState: newChannel.state
        });
        
        // Verify event bindings are in place
        console.log('✅ [PUSHER] Event listeners bound for:', {
          hasGameEndListener: true, // We bind it below
          hasGameReadyListener: true,
          hasCheckpointListener: true
        });
        
        // Notify the game that the dapp is ready
        newChannel.trigger('client-dapp-ready', {
          gameId,
          userId: authData.user.id,
          timestamp: Date.now()
        });
      });

      // Handle subscription error
      newChannel.bind('pusher:subscription_error', (error: any) => {
        console.error('❌ [PUSHER] Subscription failed:', error);
        isConnectingRef.current = false;
        setConnectionState('disconnected');
      });

      // Listen for game events
      newChannel.bind('client-game-ready', (data: any) => {
        console.log('🎮 [PUSHER] Game ready signal received:', data);
        console.log('🎮 [PUSHER] Channel is ready to receive game-end events');
        // Game is loaded and ready to receive session data
      });
      
      // Debug: Log all events on this channel (if bind_global is available)
      if (typeof (newChannel as any).bind_global === 'function') {
        (newChannel as any).bind_global((eventName: string, data: any) => {
          if (eventName.startsWith('client-')) {
            console.log(`📨 [PUSHER] Event received on channel ${channelName}:`, eventName, data);
          }
        });
      }

      newChannel.bind('client-checkpoint', async (data: GameCheckpoint) => {
        console.log('📍 [PUSHER] Checkpoint received:', data);
        
        // Process checkpoint (validate and save to DB)
        try {
          const routed = await routeGameCheckpoint({
            gameSessionId: sessionId,
            sessionToken,
            competitionCoordinator,
            checkpoint: data,
          });
          if (routed.success) {
            setGameStats(prev => ({
              ...prev,
              checkpointsReceived: prev.checkpointsReceived + 1,
              honeypotEvents: prev.honeypotEvents + (routed.honeypotDetected ? 1 : 0),
              sessionValid: routed.sessionValid,
            }));

            if (routed.honeypotDetected) {
              onHoneypotDetected?.(data.events?.find(e => e.type === 'honeypot')?.event || 'unknown');
            }

            onCheckpoint?.(data);
          } else {
            console.error('❌ [PUSHER] Checkpoint processing failed:', routed.result);
          }
        } catch (error) {
          console.error('❌ [PUSHER] Error processing checkpoint:', error);
        }
      });

      // IMPORTANT: Bind game-end event BEFORE subscription succeeds to ensure we catch it
      console.log('🔗 [PUSHER] Binding client-game-end event listener to channel:', channelName);
      const notifySessionEnd = (completed: CompletedGameEnd) => {
        if (completed.sessionNotified) return;
        completed.sessionNotified = true;
        onSessionEnd?.({
          resultId: completed.resultId,
          finalScore: completed.finalScore,
          isValid: completed.isValid,
          source: completed.source,
          status: completed.status,
          clearConfirmationRequired: completed.clearConfirmationRequired,
        });
      };
      const ensureReloadSafeClearMarker = (completed: CompletedGameEnd) => {
        if (!completed.clearConfirmationRequired || !onGameEndPersisted) return true;
        try {
          return onGameEndPersisted({
            resultId: completed.resultId,
            clearConfirmationRequired: true,
          }) === true;
        } catch (error) {
          console.error('❌ [PUSHER] Failed to persist reload-safe result marker:', error);
          return false;
        }
      };
      const gameEndHandler = async (data: GameEndData) => {
        const isPayload = Boolean(data) && typeof data === 'object' && !Array.isArray(data);
        const declaresCompetitionAttempt = isPayload &&
          Object.prototype.hasOwnProperty.call(data, 'competitionAttemptId');
        const declaresResultId = isPayload &&
          Object.prototype.hasOwnProperty.call(data, 'resultId');
        const hasValidResultId = typeof data?.resultId === 'string' &&
          data.resultId.length >= 8 && data.resultId.length <= 128;
        // Temporary DApp-first rollout bridge: the previous iframe emitted one
        // legacy result per GameSession without a result id and never confirmed
        // ACKs. A declared competition attempt is never allowed through this
        // compatibility path, even when malformed.
        const isLegacyIframePayload = isPayload &&
          !declaresCompetitionAttempt && !declaresResultId;
        if (!hasValidResultId && !isLegacyIframePayload) {
          console.error('❌ [PUSHER] Ignoring game end without a valid result id');
          return;
        }
        const resultId = hasValidResultId
          ? data.resultId as string
          : `legacy-${sessionId}`.slice(0, 128);
        const resultKey = `${sessionId}:${resultId}`;
        const emitAcknowledgement = () => {
          try {
            return newChannel.trigger('client-game-end-ack', {
              resultId,
            }) === true;
          } catch (error) {
            console.error('❌ [PUSHER] Failed to acknowledge persisted game end:', error);
            return false;
          }
        };
        const alreadyCompleted = completedGameEndsRef.current.get(resultKey);
        if (alreadyCompleted) {
          if (isLegacyIframePayload) notifySessionEnd(alreadyCompleted);
          else if (ensureReloadSafeClearMarker(alreadyCompleted)) emitAcknowledgement();
          return;
        }
        if (processingGameEndIdsRef.current.has(resultKey)) return;
        processingGameEndIdsRef.current.add(resultKey);

        console.log('🏁 [PUSHER] Game end received:', data);
        console.log('🏁 [PUSHER] Game end details:', {
          finalScore: data.finalScore,
          gameTime: data.gameTime,
          sessionId: sessionId,
          channelName: channelName,
          channelState: newChannel.state
        });
        
        // Process game end
        try {
          const routed = await routeGameEnd({
            gameSessionId: sessionId,
            sessionToken,
            competitionCoordinator,
            gameEnd: data,
          });
          if (routed.success) {
            console.log('✅ [PUSHER] Game session ended successfully:', {
              finalScore: routed.finalScore,
              isValid: routed.isValid,
              source: routed.source,
            });

            const completed: CompletedGameEnd = {
              resultId,
              finalScore: routed.finalScore,
              isValid: routed.isValid,
              source: routed.source,
              status: routed.source === 'competition' &&
                routed.result && typeof routed.result === 'object' &&
                'status' in routed.result && typeof routed.result.status === 'string'
                ? routed.result.status
                : null,
              clearConfirmationRequired: !isLegacyIframePayload,
              sessionNotified: false,
            };
            completedGameEndsRef.current.set(resultKey, completed);
            while (completedGameEndsRef.current.size > 32) {
              const oldestKey = completedGameEndsRef.current.keys().next().value;
              if (typeof oldestKey !== 'string') break;
              completedGameEndsRef.current.delete(oldestKey);
            }
            if (isLegacyIframePayload) notifySessionEnd(completed);
            else if (ensureReloadSafeClearMarker(completed)) emitAcknowledgement();
            else console.error('❌ [PUSHER] Result is durable but its reload-safe clear marker is not');
          } else {
            console.error('❌ [PUSHER] Game end processing failed:', routed.result);
          }
        } catch (error) {
          console.error('❌ [PUSHER] Error processing game end:', error);
        } finally {
          processingGameEndIdsRef.current.delete(resultKey);
        }
      };
      
      // Bind the handler to the channel
      newChannel.bind('client-game-end', gameEndHandler);
      console.log('✅ [PUSHER] client-game-end handler bound to channel:', channelName);

      // Do not rotate/clear the GameSession merely because the ACK was queued.
      // The iframe confirms it received the backend-success ACK and removed its
      // durable pending result before the parent advances to a fresh session.
      newChannel.bind('client-game-end-ack-confirmed', (data: unknown) => {
        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          typeof (data as { resultId?: unknown }).resultId !== 'string'
        ) {
          return;
        }
        const resultId = (data as { resultId: string }).resultId;
        if (resultId.length < 8 || resultId.length > 128) return;
        const completed = completedGameEndsRef.current.get(`${sessionId}:${resultId}`);
        if (completed) notifySessionEnd(completed);
      });

      newChannel.bind('client-honeypot-trigger', (data: { event: string }) => {
        console.log('🍯 [PUSHER] Honeypot triggered:', data);
        setGameStats(prev => ({
          ...prev,
          honeypotEvents: prev.honeypotEvents + 1
        }));
        onHoneypotDetected?.(data.event);
      });

      // Update refs and state
      channelRef.current = newChannel;
      sessionIdRef.current = sessionId;
      customClientRef.current = customPusherClient;
      setChannel(newChannel);

      // NEW: Send session start via Pusher instead of postMessage
      if (onSessionStart) {
        console.log('🚀 [PUSHER] Sending session start via Pusher channel');
        
        // Trigger session start event to game
        newChannel.trigger('client-session-start', {
          gameId,
          sessionId: sessionId,
          gameVersion: gameVersion || '1.0.0',
          userId: authData.user.id,
        });
        
        // Also notify the callback
        onSessionStart({
          sessionToken,
          sessionId: sessionId
        });
      }

      resolve();
      } catch (error) {
        console.error('❌ [PUSHER] Error connecting to channel:', error);
        isConnectingRef.current = false;
        setConnectionState('disconnected');
        reject(error);
      } finally {
        connectionPromiseRef.current = null;
      }
    });

    // Cleanup function
    return () => {
      console.log('🔌 [PUSHER] Cleaning up connection to:', channelName);
      isConnectingRef.current = false;
      connectionPromiseRef.current = null;
      
      if (customClientRef.current) {
        customClientRef.current.unsubscribe(channelName);
        customClientRef.current.disconnect();
        customClientRef.current = null;
      }
      
      if (channelRef.current) {
        channelRef.current = null;
      }
      
      sessionIdRef.current = null;
      setChannel(null);
      setConnectionState('disconnected');
    };

  }, [
    sessionId,
    authData.isAuthenticated,
    authData.sessionToken,
    authData.user,
    authData.user?.id,
    competitionCoordinator,
    gameId,
    gameVersion,
    onCheckpoint,
    onGameEndPersisted,
    onHoneypotDetected,
    onSessionEnd,
    onSessionStart,
  ]);

  // Send session start notification to game
  const notifySessionStart = useCallback(async (sessionData: { sessionToken: string; sessionId: string }) => {
    if (!channel) {
      console.warn('⚠️ [PUSHER] Cannot notify session start - no channel connection');
      return;
    }

    try {
      await channel.trigger('client-session-start', {
        gameId,
        sessionId: sessionData.sessionId,
        gameVersion,
        timestamp: Date.now()
      });
      
      console.log('📤 [PUSHER] Session start notification sent');
      onSessionStart?.(sessionData);
    } catch (error) {
      console.error('❌ [PUSHER] Failed to notify session start:', error);
    }
  }, [channel, gameId, gameVersion, onSessionStart]);

  // Helper function to send commands to game via Pusher
  const sendGameCommand = useCallback((command: string, data?: any) => {
    if (!channelRef.current) {
      console.warn('⚠️ [PUSHER] Cannot send command - no channel connection');
      return false;
    }

    try {
      channelRef.current.trigger('client-game-command', {
        command,
        data,
        timestamp: Date.now()
      });
      console.log(`📤 [PUSHER] Game command sent: ${command}`, data);
      return true;
    } catch (error) {
      console.error('❌ [PUSHER] Failed to send game command:', error);
      return false;
    }
  }, []);

  // Helper function to send session updates via Pusher
  const sendSessionUpdate = useCallback((sessionData: any) => {
    if (!channelRef.current) {
      console.warn('⚠️ [PUSHER] Cannot send session update - no channel connection');
      return false;
    }

    try {
      channelRef.current.trigger('client-session-update', sessionData);
      console.log('📤 [PUSHER] Session update sent:', sessionData);
      return true;
    } catch (error) {
      console.error('❌ [PUSHER] Failed to send session update:', error);
      return false;
    }
  }, []);

  return {
    channel,
    connectionState,
    gameStats,
    isConnected: connectionState === 'connected',
    notifySessionStart,
    sendGameCommand,
    sendSessionUpdate
  };
}
