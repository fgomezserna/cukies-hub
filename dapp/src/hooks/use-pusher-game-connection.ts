import { useEffect, useState, useCallback, useRef } from 'react';
import { pusherClient } from '@/lib/pusher-client';
import { triggerPusherEvent } from '@/lib/pusher-server';
import type { Channel } from 'pusher-js';

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
  sessionToken?: string;
}

interface PusherGameConnectionOptions {
  gameId: string;
  gameVersion?: string;
  onSessionStart?: (sessionData: { sessionToken: string; sessionId: string }) => void;
  onCheckpoint?: (checkpoint: GameCheckpoint) => void;
  onSessionEnd?: (result: { finalScore: number; isValid: boolean }) => void;
  onHoneypotDetected?: (event: string) => void;
}

/**
 * Hook for real-time game communication using Pusher WebSockets
 * Replaces the postMessage system with reliable WebSocket communication
 */
export function usePusherGameConnection(
  sessionId: string | null,
  authData: { isAuthenticated: boolean; user: any },
  options: PusherGameConnectionOptions
) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [sessionTokenReady, setSessionTokenReady] = useState(false);
  const [gameStats, setGameStats] = useState({
    checkpointsReceived: 0,
    honeypotEvents: 0,
    sessionValid: true
  });
  const {
    gameId,
    gameVersion,
    onCheckpoint,
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

  // Reset token ready state when sessionId changes
  useEffect(() => {
    if (sessionId !== sessionIdRef.current) {
      setSessionTokenReady(false);
    }
  }, [sessionId]);

  // Connect to Pusher channel when sessionId is available and session token exists
  useEffect(() => {
    if (!sessionId || !authData.isAuthenticated || !authData.user?.id) {
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

    // Check if session token is available, if not wait for it
    const storedSessionToken = localStorage.getItem(`session_token_${sessionId}`);
    if (!storedSessionToken) {
      console.log('⏳ [PUSHER] Waiting for session token to be stored...');
      
      // Set up an interval to check for the token
      const tokenCheckInterval = setInterval(() => {
        const token = localStorage.getItem(`session_token_${sessionId}`);
        if (token) {
          console.log('✅ [PUSHER] Session token found, setting ready state...');
          clearInterval(tokenCheckInterval);
          setSessionTokenReady(true);
        }
      }, 100); // Check every 100ms
      
      // Clean up interval after 10 seconds to prevent infinite polling
      setTimeout(() => {
        clearInterval(tokenCheckInterval);
        console.warn('⚠️ [PUSHER] Timeout waiting for session token');
      }, 10000);
      
      return () => clearInterval(tokenCheckInterval);
    } else {
      setSessionTokenReady(true);
    }

    // Only proceed if we have the session token
    if (!sessionTokenReady && !storedSessionToken) {
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

              // For dapp, we need to find the session token based on the sessionId
              // Try to get it from localStorage first (set during session start)
              const storedSessionToken = localStorage.getItem(`session_token_${sessionId}`);
              if (!storedSessionToken) {
                console.error('❌ [PUSHER DAPP] No session token found in localStorage for session:', sessionId);
                callback(new Error('No session token available'));
                return;
              }

              // Use URLSearchParams for better compatibility instead of FormData
              const params = new URLSearchParams();
              params.append('socket_id', socketId);
              params.append('channel_name', channel.name);
              params.append('session_token', storedSessionToken);

              console.log('🔐 [PUSHER DAPP] Using stored session token for auth');

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
          // Get sessionToken from localStorage for this session
          const sessionToken = localStorage.getItem(`session_token_${sessionId}`);
          
          if (!sessionToken) {
            console.error('❌ [PUSHER] No session token available for checkpoint');
            return;
          }
          
          const response = await fetch('/api/games/checkpoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken: sessionToken,
              checkpoint: data,
              events: data.events || []
            })
          });

          const result = await response.json();
          
          if (result.success) {
            setGameStats(prev => ({
              ...prev,
              checkpointsReceived: prev.checkpointsReceived + 1,
              honeypotEvents: prev.honeypotEvents + (result.honeypotDetected ? 1 : 0),
              sessionValid: result.sessionValid
            }));

            if (result.honeypotDetected) {
              onHoneypotDetected?.(data.events?.find(e => e.type === 'honeypot')?.event || 'unknown');
            }

            onCheckpoint?.(data);
          } else {
            console.error('❌ [PUSHER] Checkpoint processing failed:', result);
          }
        } catch (error) {
          console.error('❌ [PUSHER] Error processing checkpoint:', error);
        }
      });

      // IMPORTANT: Bind game-end event BEFORE subscription succeeds to ensure we catch it
      console.log('🔗 [PUSHER] Binding client-game-end event listener to channel:', channelName);
      const gameEndHandler = async (data: GameEndData) => {
        console.log('🏁 [PUSHER] Game end received:', data);
        console.log('🏁 [PUSHER] Game end details:', {
          finalScore: data.finalScore,
          gameTime: data.gameTime,
          hasSessionToken: !!data.sessionToken,
          sessionId: sessionId,
          channelName: channelName,
          channelState: newChannel.state
        });
        
        // Process game end
        try {
          // Get sessionToken from the data itself or from localStorage
          const sessionToken = data.sessionToken || localStorage.getItem(`session_token_${sessionId}`);
          
          if (!sessionToken) {
            console.error('❌ [PUSHER] No session token available for game end', {
              sessionId,
              hasDataToken: !!data.sessionToken,
              localStorageKeys: Object.keys(localStorage).filter(k => k.startsWith('session_token'))
            });
            return;
          }
          
          const response = await fetch('/api/games/end-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken: sessionToken,
              finalScore: data.finalScore,
              metadata: data.metadata,
              timestamp: new Date().toISOString()
            })
          });

          const result = await response.json();
          
          if (result.success) {
            console.log('✅ [PUSHER] Game session ended successfully:', {
              finalScore: result.finalScore,
              xpEarned: result.xpEarned,
              isValid: result.isValid
            });

            onSessionEnd?.({
              finalScore: result.finalScore,
              isValid: result.isValid
            });
          } else {
            console.error('❌ [PUSHER] Game end processing failed:', result);
            onSessionEnd?.({
              finalScore: data.finalScore,
              isValid: false
            });
          }
        } catch (error) {
          console.error('❌ [PUSHER] Error processing game end:', error);
          onSessionEnd?.({
            finalScore: data.finalScore,
            isValid: false
          });
        }
      };
      
      // Bind the handler to the channel
      newChannel.bind('client-game-end', gameEndHandler);
      console.log('✅ [PUSHER] client-game-end handler bound to channel:', channelName);

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
          sessionToken: storedSessionToken,
          sessionId: sessionId,
          gameVersion: gameVersion || '1.0.0',
          user: authData.user
        });
        
        // Also notify the callback
        onSessionStart({
          sessionToken: storedSessionToken,
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
    authData.user,
    authData.user?.id,
    gameId,
    gameVersion,
    onCheckpoint,
    onHoneypotDetected,
    onSessionEnd,
    onSessionStart,
    sessionTokenReady,
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
        sessionToken: sessionData.sessionToken,
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
