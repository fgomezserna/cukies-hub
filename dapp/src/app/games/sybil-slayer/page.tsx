'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useGameConnection } from '@/hooks/use-game-connection';
import { useAuth } from '@/providers/auth-provider';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Maximize, ExternalLink, MessageCircle, Gamepad2, Heart, Send, Trophy, Star, Medal, Crown } from 'lucide-react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import GameChat from '@/components/ui/GameChat';
import { LeaderboardPlayer } from '@/types';


// Define a type for the element to handle vendor prefixes for fullscreen
interface FullscreenElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface GameStats {
  gameId: string;
  totalPlayers: number;
  totalSessions: number;
  avgScore: number;
  topScore: number;
  userStats?: {
    bestScore: number;
    sessionsCount: number;
    rank: number;
  };
  recentSessions: Array<{
    finalScore: number;
    gameTime: number;
    xpEarned: number;
    createdAt: string;
    user: {
      username: string;
      walletAddress: string;
    };
  }>;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardPlayer[];
  totalCount: number;
  hasMore: boolean;
  gameId?: string;
  period?: string;
}

// Sistema de rangos basado en experiencia
const ranks = [
  { xp: 50000, name: 'Hyppie Master', icon: <Crown className="h-4 w-4 text-yellow-400" /> },
  { xp: 20000, name: 'Hyperliquid Veteran', icon: <Medal className="h-4 w-4 text-purple-400" /> },
  { xp: 10000, name: 'Sybil Slayer', icon: <Trophy className="h-4 w-4 text-orange-400" /> },
  { xp: 5000, name: 'Experimented Hyppie', icon: <Star className="h-4 w-4 text-blue-400" /> },
  { xp: 2500, name: 'Explorer', icon: <Star className="h-4 w-4 text-green-400" /> },
];

const getRank = (xp: number) => {
  const userRank = ranks.find(rank => xp >= rank.xp);
  return userRank ? userRank : { name: 'No Rank', icon: <Star className="h-4 w-4 text-gray-400" /> };
};

export default function SybilSlayerPage() {
  const gameContainerRef = useRef<FullscreenElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, isLoading } = useAuth();
  const [gameStats, setGameStats] = useState({
    currentScore: 0,
    bestScore: 0,
    sessionsPlayed: 0,
    validSessions: 0
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [apiGameStats, setApiGameStats] = useState<GameStats | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch game statistics and leaderboard data
  useEffect(() => {
    const fetchGameData = async () => {
      try {
        setLoading(true);
        
        // Fetch game statistics
        const statsParams = new URLSearchParams({
          gameId: 'sybil-slayer'
        });
        if (user?.id) {
          statsParams.append('userId', user.id);
        }
        
        const statsResponse = await fetch(`/api/games/stats?${statsParams}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setApiGameStats(statsData);
          
          // Update local game stats with API data
          if (statsData.userStats) {
            setGameStats(prev => ({
              ...prev,
              bestScore: statsData.userStats.bestScore,
              sessionsPlayed: statsData.userStats.sessionsCount,
              validSessions: statsData.userStats.sessionsCount // Assume all sessions are valid for now
            }));
          }
        }
        
        // Fetch leaderboard data
        const leaderboardParams = new URLSearchParams({
          gameId: 'sybil-slayer',
          period: 'all-time',
          limit: '10'
        });
        
        const leaderboardResponse = await fetch(`/api/leaderboard?${leaderboardParams}`);
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          setLeaderboardData(leaderboardData);
        }
        
      } catch (error) {
        console.error('Failed to fetch game data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGameData();
  }, [user]);

  // Memoize callback functions to prevent hook re-initialization
  const onSessionStart = useCallback((sessionData: { sessionToken: string; sessionId: string }) => {
    console.log('Game session started:', sessionData);
    setGameStats(prev => ({ ...prev, sessionsPlayed: prev.sessionsPlayed + 1 }));
  }, []);

  const onCheckpoint = useCallback((checkpoint: any) => {
    console.log('Checkpoint received:', checkpoint);
    setGameStats(prev => ({ ...prev, currentScore: checkpoint.score }));
  }, []);

  const onSessionEnd = useCallback((result: { finalScore: number; isValid: boolean }) => {
    console.log('Game session ended:', result);
    setGameStats(prev => ({
      ...prev,
      bestScore: Math.max(prev.bestScore, result.finalScore),
      currentScore: 0,
      validSessions: prev.validSessions + (result.isValid ? 1 : 0)
    }));
  }, []);

  const onHoneypotDetected = useCallback((event: string) => {
    console.warn('Honeypot detected:', event);
  }, []);

  // Memoize the options object to prevent hook re-initialization
  const gameConnectionOptions = useCallback(() => ({
    gameId: 'sybil-slayer',
    gameVersion: '1.0.0',
    onSessionStart,
    onCheckpoint,
    onSessionEnd,
    onHoneypotDetected
  }), [onSessionStart, onCheckpoint, onSessionEnd, onHoneypotDetected]);

  // Memoize auth data to prevent hook re-initialization
  const authData = useCallback(() => ({
    isAuthenticated: !!user && !isLoading,
    user: user,
  }), [user, isLoading]);

  // Use the enhanced game connection hook
  const { currentSession, gameStats: sessionStats, isSessionActive, startGameSession } = useGameConnection(
    iframeRef,
    authData(),
    gameConnectionOptions()
  );

  const handleFullScreen = () => {
    const element = gameContainerRef.current;
    if (element) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) { /* Safari */
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) { /* IE11 */
        element.msRequestFullscreen();
      }
    }
  };

  // Real-time game data
  const userHighScore = gameStats.bestScore || 0;
  const userXP = user?.xp ?? 0;
  const userRank = getRank(userXP);
  const currentScore = gameStats.currentScore;



  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
        
        {/* Left Column: Game */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div ref={gameContainerRef} className="bg-card flex-grow flex flex-col relative overflow-hidden rounded-lg border">
            <iframe
              ref={iframeRef}
              src={`${process.env.GAME_SYBILSLASH || 'http://localhost:9002/'}`}
              className="w-full h-full border-0 min-h-[480px] lg:min-h-0"
              title="Sybil Slayer Game"
              allowFullScreen

            ></iframe>
                           <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-2 left-2 text-white/50 bg-black/10 hover:text-white hover:bg-black/30 backdrop-blur-sm"
                onClick={handleFullScreen}
                title="Toggle Fullscreen"
              >
                <Maximize className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-2 right-2 text-white/50 bg-black/10 hover:text-white hover:bg-black/30 backdrop-blur-sm"
                onClick={() => {
                  console.log('🔍 [DEBUG] Manual auth check:', {
                    user,
                    isLoading,
                    isAuthenticated: !!user && !isLoading
                  });
                  if (iframeRef.current) {
                    console.log('🔍 [DEBUG] Sending manual auth message');
                    const message = {
                      type: 'AUTH_STATE_CHANGED',
                      payload: { isAuthenticated: !!user && !isLoading, user }
                    };
                    iframeRef.current.contentWindow?.postMessage(message, 'http://localhost:9002');
                    
                    // Also try to start session manually
                    if (user?.id) {
                      console.log('🔍 [DEBUG] Manually starting session for user:', user.id);
                      startGameSession(user.id);
                    }
                  }
                }}
                title="Debug Auth"
              >
                🔍
              </Button>
          </div>
          <Card>
            <CardContent className="p-4 flex flex-wrap justify-around items-center text-center gap-4">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                    <Gamepad2 className="h-5 w-5 text-primary" />
                    <span>PLAY</span>
                </div>
                <Separator orientation="vertical" className="h-6 hidden sm:block"/>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                    <Heart className="h-5 w-5 text-primary" />
                    <span>HAVE FUN</span>
                </div>
                <Separator orientation="vertical" className="h-6 hidden sm:block"/>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                    <Trophy className="h-5 w-5 text-primary" />
                    <span>EARN XP</span>
                </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Game Info & Stats */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          
          {/* 1. Título del juego y descripción */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                🎮 Sybil Slayer
              </CardTitle>
              <CardDescription className="text-sm">
                Collect energy points while avoiding enemies in this intense survival game.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* 2. High Score del usuario */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-400" />
                Your High Score
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-400/10 rounded-md">
                  <Trophy className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-yellow-400">
                  {user ? userHighScore.toLocaleString() : '---'}
                </div>
              </div>
              {!user && (
                <p className="text-xs text-muted-foreground mt-2">
                  Connect wallet to track your scores
                </p>
              )}
            </CardContent>
          </Card>
          
          {/* 3. Rank del usuario */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {userRank.icon}
                Your Rank
              </CardTitle>
            </CardHeader>
                        <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                  {userRank.icon}
                </div>
                <div className="flex-1">
                  <span className="font-bold text-primary">{userRank.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({user ? `${userXP.toLocaleString()} XP` : 'Connect wallet'})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Top Slayers */}
          <Card className="flex-grow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-400" />
                Top Slayers
              </CardTitle>
              <CardDescription>Best players this season</CardDescription>
            </CardHeader>
            <CardContent className="p-3">
              <div className="space-y-0">
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="text-sm text-muted-foreground">Loading...</div>
                  </div>
                ) : leaderboardData?.leaderboard.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="text-sm text-muted-foreground">No players yet</div>
                  </div>
                ) : (
                  leaderboardData?.leaderboard.slice(0, 5).map((player, index) => (
                    <div key={player.walletAddress} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="text-sm font-bold text-muted-foreground w-6">
                          #{index + 1}
                        </div>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={player.avatar} />
                          <AvatarFallback className="text-xs">
                            {player.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{player.name}</p>
                        </div>
                      </div>
                      <div className="text-sm font-mono font-bold text-yellow-400">
                        {player.totalPoints.toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* 5. Chat - Real-time chat integration */}
          <Button 
            variant="outline" 
            className="w-full justify-center gap-2 bg-card"
            onClick={() => setIsChatOpen(true)}
          >
            <MessageCircle className="h-5 w-5" />
            <span>Chat</span>
          </Button>
          
          <GameChat 
            gameId="sybil-slayer" 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)} 
          />
        </div>
      </div>
    </AppLayout>
  );
}
