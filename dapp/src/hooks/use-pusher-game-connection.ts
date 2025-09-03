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

  // Refs to prevent cleanup issues
  const channelRef = useRef<Channel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const customClientRef = useRef<any>(null);
  const isConnectingRef = useRef(false);

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
    if (isConnectingRef.current) {
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
    console.log('🔗 [PUSHER] Connecting to channel:', channelName);
    
    isConnectingRef.current = true;
    setConnectionState('connecting');
    
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
      const newChannel = customPusherClient.subscribe(channelName);

      // Handle subscription success
      newChannel.bind('pusher:subscription_succeeded', () => {
        console.log('✅ [PUSHER] Successfully subscribed to:', channelName);
        isConnectingRef.current = false;
        setConnectionState('connected');
        
        // Notify the game that the dapp is ready
        newChannel.trigger('client-dapp-ready', {
          gameId: options.gameId,
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
        // Game is loaded and ready to receive session data
      });

      newChannel.bind('client-checkpoint', async (data: GameCheckpoint) => {
        console.log('📍 [PUSHER] Checkpoint received:', data);
        
        // Process checkpoint (validate and save to DB)
        try {
          const response = await fetch('/api/games/checkpoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken: authData.sessionToken, // Use actual sessionToken, not sessionId
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
              options.onHoneypotDetected?.(data.events?.find(e => e.type === 'honeypot')?.event || 'unknown');
            }

            options.onCheckpoint?.(data);
          } else {
            console.error('❌ [PUSHER] Checkpoint processing failed:', result);
          }
        } catch (error) {
          console.error('❌ [PUSHER] Error processing checkpoint:', error);
        }
      });

      newChannel.bind('client-game-end', async (data: GameEndData) => {
        console.log('🏁 [PUSHER] Game end received:', data);
        
        // Process game end
        try {
          const response = await fetch('/api/games/end-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken: authData.sessionToken, // Use actual sessionToken, not sessionId
              finalScore: data.finalScore,
              metadata: data.metadata
            })
          });

          const result = await response.json();
          
          if (result.success) {
            console.log('✅ [PUSHER] Game session ended successfully:', {
              finalScore: result.finalScore,
              xpEarned: result.xpEarned,
              isValid: result.isValid
            });

            options.onSessionEnd?.({
              finalScore: result.finalScore,
              isValid: result.isValid
            });
          } else {
            console.error('❌ [PUSHER] Game end processing failed:', result);
            options.onSessionEnd?.({
              finalScore: data.finalScore,
              isValid: false
            });
          }
        } catch (error) {
          console.error('❌ [PUSHER] Error processing game end:', error);
          options.onSessionEnd?.({
            finalScore: data.finalScore,
            isValid: false
          });
        }
      });

      newChannel.bind('client-honeypot-trigger', (data: { event: string }) => {
        console.log('🍯 [PUSHER] Honeypot triggered:', data);
        setGameStats(prev => ({
          ...prev,
          honeypotEvents: prev.honeypotEvents + 1
        }));
        options.onHoneypotDetected?.(data.event);
      });

      // Update refs and state
      channelRef.current = newChannel;
      sessionIdRef.current = sessionId;
      customClientRef.current = customPusherClient;
      setChannel(newChannel);

      // NEW: Send session start via Pusher instead of postMessage
      if (options.onSessionStart) {
        console.log('🚀 [PUSHER] Sending session start via Pusher channel');
        
        // Trigger session start event to game
        newChannel.trigger('client-session-start', {
          gameId: options.gameId,
          sessionToken: sessionId,
          sessionId: sessionId,
          gameVersion: options.gameVersion || '1.0.0',
          user: authData.user
        });
        
        // Also notify the callback
        options.onSessionStart({
          sessionToken: sessionId,
          sessionId: sessionId
        });
      }

    } catch (error) {
      console.error('❌ [PUSHER] Error connecting to channel:', error);
      isConnectingRef.current = false;
      setConnectionState('disconnected');
    }

    // Cleanup function
    return () => {
      console.log('🔌 [PUSHER] Cleaning up connection to:', channelName);
      isConnectingRef.current = false;
      
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

  }, [sessionId, authData.isAuthenticated, authData.user?.id, options.gameId, sessionTokenReady]);

  // Send session start notification to game
  const notifySessionStart = useCallback(async (sessionData: { sessionToken: string; sessionId: string }) => {
    if (!channel) {
      console.warn('⚠️ [PUSHER] Cannot notify session start - no channel connection');
      return;
    }

    try {
      await channel.trigger('client-session-start', {
        gameId: options.gameId,
        sessionToken: sessionData.sessionToken,
        sessionId: sessionData.sessionId,
        gameVersion: options.gameVersion,
        timestamp: Date.now()
      });
      
      console.log('📤 [PUSHER] Session start notification sent');
      options.onSessionStart?.(sessionData);
    } catch (error) {
      console.error('❌ [PUSHER] Failed to notify session start:', error);
    }
  }, [channel, options.gameId, options.gameVersion, options.onSessionStart]);

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