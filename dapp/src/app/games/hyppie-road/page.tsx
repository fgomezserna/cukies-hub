'use client';

import React, { useRef, useState } from 'react';
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
import GameChat from '@/components/ui/GameChat';


// Define a type for the element to handle vendor prefixes for fullscreen
interface FullscreenElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

// Mock data - En el futuro esto vendrá de la base de datos
const mockTopRiders = [
  { id: 1, username: "RoadMaster", profilePicture: "https://placehold.co/40x40.png", score: 25680 },
  { id: 2, username: "CryptoDriver", profilePicture: "https://placehold.co/40x40.png", score: 24320 },
  { id: 3, username: "HyppieRacer", profilePicture: "https://placehold.co/40x40.png", score: 23150 },
  { id: 4, username: "BlockchainSpeed", profilePicture: "https://placehold.co/40x40.png", score: 22890 },
  { id: 5, username: "TokenRunner", profilePicture: "https://placehold.co/40x40.png", score: 21450 }
];

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
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Use the hook to send authentication data to the game
  useParentConnection(iframeRef, {
    isAuthenticated: !!user && !isLoading,
    user: user,
  });

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

  // Mock data - En el futuro vendrá de la base de datos
  const userHighScore = user ? 18750 : 0; // High score del usuario actual
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
                {mockTopRiders.map((player, index) => (
                  <div key={player.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="text-sm font-bold text-muted-foreground w-6">
                        #{index + 1}
                  </div>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={player.profilePicture} />
                        <AvatarFallback className="text-xs">
                          {player.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{player.username}</p>
                </div>
                  </div>
                    <div className="text-sm font-mono font-bold text-yellow-400">
                      {player.score.toLocaleString()}
                </div>
                  </div>
                ))}
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
            gameId="hyppie-road" 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)} 
          />
        </div>
      </div>
    </AppLayout>
  );
}