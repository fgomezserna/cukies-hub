'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useParentConnection } from '@/hooks/use-parent-connection';
import { useAuth } from '@/providers/auth-provider';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Maximize, MessageCircle, Gamepad2, Heart, Send, Trophy, Star, Medal, Crown, Car } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  { xp: 50000, name: 'Road Legend', icon: <Crown className="h-4 w-4 text-yellow-400" /> },
  { xp: 20000, name: 'Highway Master', icon: <Medal className="h-4 w-4 text-purple-400" /> },
  { xp: 10000, name: 'Speed Demon', icon: <Trophy className="h-4 w-4 text-orange-400" /> },
  { xp: 5000, name: 'Experienced Driver', icon: <Car className="h-4 w-4 text-blue-400" /> },
  { xp: 2500, name: 'Road Explorer', icon: <Star className="h-4 w-4 text-green-400" /> },
];

const getRank = (xp: number) => {
  const userRank = ranks.find(rank => xp >= rank.xp);
  return userRank ? userRank : { name: 'No Rank', icon: <Star className="h-4 w-4 text-gray-400" /> };
};

export default function HyppieRoadPage() {
  const gameContainerRef = useRef<FullscreenElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, isLoading } = useAuth();
  const [apiGameStats, setApiGameStats] = useState<GameStats | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Use the hook to send authentication data to the game
  useParentConnection(iframeRef, {
    isAuthenticated: !!user && !isLoading,
    user: user,
  });

  // Fetch game statistics and leaderboard data
  useEffect(() => {
    const fetchGameData = async () => {
      try {
        setLoading(true);
        
        // Fetch game statistics
        const statsParams = new URLSearchParams({
          gameId: 'hyppie-road'
        });
        if (user?.id) {
          statsParams.append('userId', user.id);
        }
        
        const statsResponse = await fetch(`/api/games/stats?${statsParams}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setApiGameStats(statsData);
        }
        
        // Fetch leaderboard data
        const leaderboardParams = new URLSearchParams({
          gameId: 'hyppie-road',
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

  // Real data from API
  const userHighScore = apiGameStats?.userStats?.bestScore ?? 0;
  const userXP = user?.xp ?? 0;
  const userRank = getRank(userXP);

  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
        
        {/* Left Column: Game */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div ref={gameContainerRef} className="bg-card flex-grow flex flex-col relative overflow-hidden rounded-lg border">
            <iframe
              ref={iframeRef}
              src={`${process.env.GAME_HYPPIE_ROAD || 'https://hyppie-stack-dapp.vercel.app/'}`}
              className="w-full h-full border-0 min-h-[480px] lg:min-h-0"
              title="Hyppie Road Game"
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
                🛣️ Hyppie Road
              </CardTitle>
              <CardDescription className="text-sm">
                Navigate the crypto road, avoid traps, and multiply your rewards in this thrilling betting game.
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

          {/* 4. Top Riders */}
          <Card className="flex-grow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-400" />
                Top Riders
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

          {/* 5. Chat - mantenido como estaba */}
           <Sheet>
            <SheetTrigger asChild>
               <Button variant="outline" className="w-full justify-center gap-2 bg-card">
                <MessageCircle className="h-5 w-5" />
                <span>Chat</span>
               </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-0">
              <SheetHeader className="p-6 pb-4">
                <SheetTitle>Live Chat</SheetTitle>
                <SheetDescription>
                  Chat with other players in real-time.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-grow overflow-y-auto p-6 space-y-6">
                <div className="flex gap-3 text-sm">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="road master" />
                    <AvatarFallback>RM</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-bold text-primary">RoadMaster</p>
                    <div className="bg-muted p-3 rounded-lg mt-1">
                      <p>Just hit a huge multiplier! 🚀</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 text-sm justify-end">
                   <div className="flex-1">
                    <p className="font-bold text-right">You</p>
                    <div className="bg-primary text-primary-foreground p-3 rounded-lg mt-1">
                      <p>Nice one! This game is addictive!</p>
                    </div>
                  </div>
                   <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="profile avatar" />
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                </div>
                 <div className="flex gap-3 text-sm">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="crypto driver" />
                    <AvatarFallback>CD</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-bold text-primary">CryptoDriver</p>
                    <div className="bg-muted p-3 rounded-lg mt-1">
                      <p>Let's gooo! 🔥</p>
                    </div>
                  </div>
                </div>
              </div>
              <SheetFooter className="p-4 border-t bg-card">
                <form className="flex w-full space-x-2" onSubmit={(e) => e.preventDefault()}>
                  <Input placeholder="Type your message..." className="flex-1" />
                  <Button type="submit" size="icon">
                    <Send className="h-4 w-4" />
                    <span className="sr-only">Send</span>
                  </Button>
                </form>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </AppLayout>
  );
}