'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { usePusherGameConnection } from '@/hooks/use-pusher-game-connection';
import { useAuth } from '@/providers/auth-provider';
import { useGameData } from '@/hooks/use-game-data';
import GameLayout from '@/components/layout/GameLayout';
import GameLoadingSkeleton from '@/components/ui/game-loading-skeleton';

export default function SybilSlayerPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error } = useGameData('sybil-slayer');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  
  // Local game state for real-time updates
  const [localGameStats, setLocalGameStats] = useState({
    currentScore: 0,
    bestScore: 0,
    sessionsPlayed: 0,
    validSessions: 0
  });

  // Detect room parameter from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    
    if (roomParam) {
      console.log('🏠 [DAPP] Room parameter detected:', roomParam);
      setRoomId(roomParam);
    }
  }, []);

  // Game connection callbacks
  const onSessionStart = useCallback((sessionData: { sessionToken: string; sessionId: string }) => {
    console.log('🚀 [DAPP-PUSHER] Game session started:', sessionData);
    setLocalGameStats(prev => ({ ...prev, sessionsPlayed: prev.sessionsPlayed + 1 }));
  }, []);

  const onCheckpoint = useCallback((checkpoint: any) => {
    console.log('📍 [DAPP-PUSHER] Checkpoint received:', checkpoint);
    setLocalGameStats(prev => ({ ...prev, currentScore: checkpoint.score }));
  }, []);

  const onSessionEnd = useCallback((result: { finalScore: number; isValid: boolean }) => {
    console.log('🏁 [DAPP-PUSHER] Game session ended:', result);
    
    // Clean up localStorage
    if (currentSessionId) {
      localStorage.removeItem(`session_token_${currentSessionId}`);
      console.log('🧹 [DAPP-PUSHER] Session token removed from localStorage');
    }
    
    setLocalGameStats(prev => ({
      ...prev,
      bestScore: Math.max(prev.bestScore, result.finalScore),
      currentScore: 0,
      validSessions: prev.validSessions + (result.isValid ? 1 : 0)
    }));
    
    // Reset session ID for new game
    setCurrentSessionId(null);
  }, [currentSessionId]);

  const onHoneypotDetected = useCallback((event: string) => {
    console.warn('🍯 [DAPP-PUSHER] Honeypot detected:', event);
  }, []);

  // Set up Pusher game connection options
  const gameConnectionOptions = React.useMemo(() => ({
    gameId: 'sybil-slayer',
    gameVersion: '1.0.0',
    onSessionStart,
    onCheckpoint,
    onSessionEnd,
    onHoneypotDetected
  }), [onSessionStart, onCheckpoint, onSessionEnd, onHoneypotDetected]);

  const authData = React.useMemo(() => ({
    isAuthenticated: !!user && !isLoading,
    user: user,
  }), [user, isLoading]);

  // Use the Pusher game connection hook
  const { 
    channel, 
    connectionState, 
    gameStats: pusherGameStats, 
    isConnected,
    notifySessionStart,
    sendGameCommand,
    sendSessionUpdate
  } = usePusherGameConnection(currentSessionId, authData, gameConnectionOptions);

  // Listen for game ready signal
  useEffect(() => {
    const handleGameMessage = async (event: MessageEvent) => {
      console.log('📨 [DAPP-PUSHER] Message from game:', event.data);
      
      if (event.data?.type === 'GAME_READY') {
        console.log('🎮 [DAPP-PUSHER] Game is ready, can send session data');
        // Game is ready to receive messages
      } else if (event.data?.type === 'PUSHER_AUTH_REQUEST') {
        console.log('🔐 [DAPP-PUSHER] Handling Pusher auth request:', event.data.authId);
        
        try {
          // Make auth request to our own API
          const params = new URLSearchParams();
          params.append('socket_id', event.data.socketId);
          params.append('channel_name', event.data.channelName);
          params.append('session_token', event.data.sessionToken);

          const response = await fetch('/api/pusher/auth-simple', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString()
          });

          if (response.ok) {
            const authData = await response.json();
            console.log('✅ [DAPP-PUSHER] Auth successful, sending to game');
            
            // Send success response back to game
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage({
                type: 'PUSHER_AUTH_RESPONSE',
                authId: event.data.authId,
                success: true,
                authData
              }, '*');
            }
          } else {
            const errorData = await response.json();
            console.error('❌ [DAPP-PUSHER] Auth failed:', errorData);
            
            // Send error response back to game
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage({
                type: 'PUSHER_AUTH_RESPONSE',
                authId: event.data.authId,
                success: false,
                error: errorData.error || 'Authentication failed'
              }, '*');
            }
          }
        } catch (error) {
          console.error('❌ [DAPP-PUSHER] Auth request error:', error);
          
          // Send error response back to game
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
              type: 'PUSHER_AUTH_RESPONSE',
              authId: event.data.authId,
              success: false,
              error: 'Authentication request failed'
            }, '*');
          }
        }
      }
    };

    window.addEventListener('message', handleGameMessage);
    return () => window.removeEventListener('message', handleGameMessage);
  }, [iframeRef]);

  // Start game session when user is authenticated
  useEffect(() => {
    const startSession = async () => {
      if (!authData.isAuthenticated || !user?.id || currentSessionId) return;

      try {
        console.log('🚀 [DAPP-PUSHER] Starting new game session...');
        
        const response = await fetch('/api/games/start-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            gameId: 'sybil-slayer',
            gameVersion: '1.0.0'
          })
        });

        const data = await response.json();
        
        if (data.success) {
          console.log('✅ [DAPP-PUSHER] Session created:', data);
          setCurrentSessionId(data.sessionId);
          
          // Store session token in localStorage for Pusher auth
          localStorage.setItem(`session_token_${data.sessionId}`, data.sessionToken);
          console.log('💾 [DAPP-PUSHER] Session token stored in localStorage');
          
          // Notify the session start callback
          onSessionStart({
            sessionToken: data.sessionToken,
            sessionId: data.sessionId
          });
          
          // Send session data to game via postMessage (initial handshake)
          // After this, all communication will be via Pusher
          const sendSessionData = () => {
            const sessionData = {
              type: 'GAME_SESSION_START',
              payload: {
                gameId: 'sybil-slayer',
                sessionToken: data.sessionToken,
                sessionId: data.sessionId,
                gameVersion: '1.0.0',
                // Include room ID for multiplayer matches
                roomId: roomId,
                // Include user info for Pusher auth
                user: {
                  id: user.id,
                  name: user.username || 'Anonymous',
                  email: user.email
                }
              }
            };

            console.log('📤 [DAPP-PUSHER] Sending session data to game:', sessionData);
            
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(sessionData, '*');
            } else {
              console.warn('⚠️ [DAPP-PUSHER] iframe contentWindow not available');
            }
          };

          // Try immediately
          sendSessionData();
          
          // Also try after a delay in case iframe is still loading
          setTimeout(sendSessionData, 1000);
          setTimeout(sendSessionData, 2000);
        } else {
          console.error('❌ [DAPP-PUSHER] Failed to create session:', data);
        }
      } catch (error) {
        console.error('❌ [DAPP-PUSHER] Error starting session:', error);
      }
    };

    startSession();
  }, [authData.isAuthenticated, user?.id, currentSessionId, onSessionStart, roomId]);

  // Handle game connection setup - just pass the ref
  const handleGameConnection = useCallback((iframeRef: React.RefObject<HTMLIFrameElement>) => {
    // The Pusher connection is handled by the hook
    // This callback just receives the ref from GameLayout
    return;
  }, []);

  // Show loading state
  if (loading || !gameConfig) {
    return <GameLoadingSkeleton message="Loading Sybil Slayer..." />;
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <GameLayout
      gameConfig={gameConfig}
      gameStats={gameStats || {
        gameId: 'sybil-slayer',
        totalPlayers: 0,
        totalSessions: 0,
        avgScore: 0,
        topScore: 0,
        recentSessions: []
      }}
      leaderboardData={leaderboardData || {
        leaderboard: [],
        totalCount: 0,
        hasMore: false
      }}
      loading={loading}
      iframeRef={iframeRef}
      onGameConnection={handleGameConnection}
    />
  );
}