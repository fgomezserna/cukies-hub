'use client';

import React, { useRef, useState, useCallback, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Maximize, MessageCircle, Gamepad2, Heart, Trophy, Star, Medal, Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import GameChat from '@/components/ui/GameChat';
import { markParentIframeNavigation } from '@/lib/parent-iframe-navigation';
import { cn } from '@/lib/utils';
import { useMobileGameShell } from '@/hooks/use-mobile-game-shell';
import { GameConfig, GameStats, GameLayoutProps } from '@/types/game';
import { LeaderboardPlayer } from '@/types';

// Define a type for the element to handle vendor prefixes for fullscreen
interface FullscreenElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msFullscreenElement?: Element | null;
  msExitFullscreen?: () => Promise<void> | void;
}

interface GameLayoutComponentProps extends GameLayoutProps {
  onGameConnection?: (iframeRef: React.RefObject<HTMLIFrameElement>) => void;
  iframeRef?: React.RefObject<HTMLIFrameElement>; // Allow external ref
  children?: ReactNode; // For any additional game-specific content
  mobileFocus?: boolean;
}

// Helper function to get user rank based on XP and game-specific ranks
const getUserRank = (xp: number, ranks: GameConfig['ranks']) => {
  const userRank = ranks.find(rank => xp >= rank.xp);
  return userRank ? userRank : { 
    name: 'No Rank', 
    icon: 'Star', 
    color: 'text-gray-400' 
  };
};

// Helper function to render icon based on string name
const renderIcon = (iconName: string, className: string = "h-4 w-4") => {
  const iconMap: { [key: string]: ReactNode } = {
    Crown: <Crown className={className} />,
    Medal: <Medal className={className} />,
    Trophy: <Trophy className={className} />,
    Star: <Star className={className} />,
    Gamepad2: <Gamepad2 className={className} />,
    Heart: <Heart className={className} />,
  };
  
  return iconMap[iconName] || <Star className={className} />;
};

export default function GameLayout({ 
  gameConfig, 
  gameStats, 
  leaderboardData, 
  loading,
  onGameConnection,
  iframeRef: externalIframeRef,
  children,
  mobileFocus = false,
}: GameLayoutComponentProps) {
  const gameContainerRef = useRef<FullscreenElement>(null);
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef || internalIframeRef;
  const { user } = useAuth();
  const isMobileGameShell = useMobileGameShell();
  const isMobileFocus = mobileFocus && isMobileGameShell;
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Call the game connection callback when iframe ref is ready (optional)
  useEffect(() => {
    if (onGameConnection && iframeRef.current) {
      onGameConnection(iframeRef);
    }
  }, [onGameConnection, iframeRef]);

  const handleFullScreen = () => {
    const element = gameContainerRef.current;
    const fullscreenDocument = document as FullscreenDocument;
    if (element) {
      const fullscreenElement =
        fullscreenDocument.fullscreenElement ||
        fullscreenDocument.webkitFullscreenElement ||
        fullscreenDocument.msFullscreenElement;

      if (fullscreenElement) {
        if (fullscreenDocument.exitFullscreen) {
          void fullscreenDocument.exitFullscreen();
        } else if (fullscreenDocument.webkitExitFullscreen) {
          void fullscreenDocument.webkitExitFullscreen();
        } else if (fullscreenDocument.msExitFullscreen) {
          void fullscreenDocument.msExitFullscreen();
        }
      } else if (element.requestFullscreen) {
        void element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) { /* Safari */
        void element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) { /* IE11 */
        void element.msRequestFullscreen();
      }
    }
  };

  const handleIframeLoad = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      markParentIframeNavigation(event.currentTarget);
    },
    [],
  );

  // Calculate user-specific data
  const userHighScore = gameStats.userStats?.bestScore ?? 0;
  const userXP = user?.xp ?? 0;
  const userRank = getUserRank(userXP, gameConfig.ranks);

  // Default play instructions if not provided
  const defaultInstructions = [
    { icon: 'Gamepad2', text: 'PLAY' },
    { icon: 'Heart', text: 'HAVE FUN' },
    { icon: 'Trophy', text: 'EARN XP' }
  ];

  const playInstructions = gameConfig.playInstructions || defaultInstructions;

  if (gameConfig.isInMaintenance) {
    return (
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <div className="text-4xl mb-4">🚧</div>
              <h2 className="text-xl font-bold mb-2">Game Under Maintenance</h2>
              <p className="text-muted-foreground">
                {gameConfig.name} is currently under maintenance. Please check back later!
              </p>
            </CardContent>
          </Card>
        </div>
    );
  }

  return (
      <div
        data-game-layout={isMobileFocus ? 'mobile-focus' : 'standard'}
        className={cn(
          'grid h-full min-h-0 grid-cols-1',
          isMobileFocus ? 'gap-0' : 'gap-6 lg:grid-cols-4',
        )}
      >
        
        {/* Left Column: Game */}
        <div
          className={cn(
            'flex min-h-0 flex-col',
            isMobileFocus ? 'h-full gap-0' : 'gap-6 lg:col-span-3',
          )}
        >
          <div
            ref={gameContainerRef}
            data-game-viewport
            className={cn(
              'relative flex min-h-0 flex-grow flex-col overflow-hidden bg-card',
              isMobileFocus ? 'h-full rounded-none border-0' : 'rounded-lg border',
            )}
          >
            <iframe
              ref={iframeRef}
              src={gameConfig.gameUrl}
              className="block h-full min-h-0 w-full flex-1 overscroll-contain border-0 touch-manipulation"
              title={gameConfig.name}
              allow="clipboard-read; clipboard-write"
              allowFullScreen
              onLoad={handleIframeLoad}
            />
            <div
              className="absolute z-30 flex items-center gap-2"
              style={{
                bottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                left: 'max(0.5rem, env(safe-area-inset-left))',
              }}
            >
              {isMobileFocus && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 bg-black/35 text-white/80 backdrop-blur-sm hover:bg-black/55 hover:text-white"
                >
                  <Link href="/games" aria-label="Volver a juegos" title="Volver a juegos">
                    <ArrowLeft className="h-5 w-5" />
                  </Link>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'bg-black/20 text-white/60 backdrop-blur-sm hover:bg-black/45 hover:text-white',
                  isMobileFocus && 'h-11 w-11',
                )}
                onClick={handleFullScreen}
                aria-label="Alternar pantalla completa"
                title="Alternar pantalla completa"
              >
                <Maximize className="h-5 w-5" />
              </Button>
            </div>
          </div>
          
          {/* Game Instructions */}
          {!isMobileFocus && (
            <Card>
              <CardContent className="p-4 flex flex-wrap justify-around items-center text-center gap-4">
                {playInstructions.map((instruction, index) => (
                  <React.Fragment key={instruction.text}>
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                      {renderIcon(instruction.icon, "h-5 w-5 text-primary")}
                      <span>{instruction.text}</span>
                    </div>
                    {index < playInstructions.length - 1 && (
                      <Separator orientation="vertical" className="h-6 hidden sm:block"/>
                    )}
                  </React.Fragment>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Game Info & Stats */}
        {!isMobileFocus && (
        <div className="lg:col-span-1 flex flex-col gap-3">
          
          {/* 1. Game Title and Description */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                {gameConfig.emoji} {gameConfig.name}
              </CardTitle>
              <CardDescription className="text-sm">
                {gameConfig.description}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* 2. User High Score */}
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
          
          {/* 3. User Rank */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {renderIcon(userRank.icon)}
                Your Rank
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                  {renderIcon(userRank.icon)}
                </div>
                <div className="flex-1">
                  <span className={`font-bold ${userRank.color || 'text-primary'}`}>
                    {userRank.name}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({user ? `${userXP.toLocaleString()} XP` : 'Connect wallet'})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Leaderboard */}
          <Card className="flex-grow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-400" />
                {gameConfig.leaderboardTitle}
              </CardTitle>
              <CardDescription>Best players this season</CardDescription>
            </CardHeader>
            <CardContent className="p-3">
              <div className="space-y-0">
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="text-sm text-muted-foreground">Loading...</div>
                  </div>
                ) : leaderboardData.leaderboard.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="text-sm text-muted-foreground">No players yet</div>
                  </div>
                ) : (
                  leaderboardData.leaderboard.slice(0, 5).map((player, index) => (
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

          {/* 5. Chat Button */}
          <Button 
            variant="outline" 
            className="w-full justify-center gap-2 bg-card"
            onClick={() => setIsChatOpen(true)}
          >
            <MessageCircle className="h-5 w-5" />
            <span>Chat</span>
          </Button>
          
          <GameChat 
            gameId={gameConfig.gameId} 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)} 
          />

          {/* Additional game-specific content */}
          {children}
        </div>
        )}
      </div>
  );
}
