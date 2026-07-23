'use client';

import React, { useRef, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Maximize, Minimize2, MessageCircle, Gamepad2, Heart, Trophy, Star, Medal, Crown, Wallet } from 'lucide-react';
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

interface LockableScreenOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
}

interface GameLayoutComponentProps extends GameLayoutProps {
  onGameConnection?: (iframeRef: React.RefObject<HTMLIFrameElement>) => void;
  iframeRef?: React.RefObject<HTMLIFrameElement>; // Allow external ref
  children?: ReactNode; // For any additional game-specific content
  desktopBanner?: ReactNode; // Important desktop context rendered above the game shell
  desktopSidebar?: ReactNode; // Optional game-specific preparation/status panel
  desktopFooter?: ReactNode;
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
  desktopBanner,
  desktopSidebar,
  desktopFooter,
  mobileFocus = false,
}: GameLayoutComponentProps) {
  const gameContainerRef = useRef<FullscreenElement>(null);
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef || internalIframeRef;
  const { user } = useAuth();
  const isMobileGameShell = useMobileGameShell();
  const isMobileFocus = mobileFocus && isMobileGameShell;
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const isFullscreen = isNativeFullscreen || isFallbackFullscreen;

  // Call the game connection callback when iframe ref is ready (optional)
  useEffect(() => {
    if (onGameConnection && iframeRef.current) {
      onGameConnection(iframeRef);
    }
  }, [onGameConnection, iframeRef]);

  const unlockOrientation = useCallback(() => {
    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
    try {
      orientation?.unlock?.();
    } catch {
      // Some wallet browsers expose the API but reject orientation changes.
    }
  }, []);

  const requestLandscape = useCallback(async () => {
    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
    if (!orientation?.lock) return;
    try {
      await orientation.lock('landscape');
    } catch {
      // The in-game portrait overlay still gives the player an explicit cue.
    }
  }, []);

  useEffect(() => {
    const fullscreenDocument = document as FullscreenDocument;
    const syncFullscreenState = () => {
      const active = Boolean(
        fullscreenDocument.fullscreenElement ||
        fullscreenDocument.webkitFullscreenElement ||
        fullscreenDocument.msFullscreenElement,
      );
      setIsNativeFullscreen(active);
      if (active) setIsFallbackFullscreen(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!isFallbackFullscreen) return undefined;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isFallbackFullscreen]);

  useEffect(() => () => unlockOrientation(), [unlockOrientation]);

  const handleFullScreen = useCallback(async () => {
    const element = gameContainerRef.current;
    const fullscreenDocument = document as FullscreenDocument;
    if (!element) return;

    const fullscreenElement =
      fullscreenDocument.fullscreenElement ||
      fullscreenDocument.webkitFullscreenElement ||
      fullscreenDocument.msFullscreenElement;
    if (fullscreenElement || isFallbackFullscreen) {
      try {
        if (fullscreenElement && fullscreenDocument.exitFullscreen) {
          await fullscreenDocument.exitFullscreen();
        } else if (fullscreenElement && fullscreenDocument.webkitExitFullscreen) {
          await fullscreenDocument.webkitExitFullscreen();
        } else if (fullscreenElement && fullscreenDocument.msExitFullscreen) {
          await fullscreenDocument.msExitFullscreen();
        }
      } catch {
        // The CSS fullscreen fallback can still be closed independently.
      } finally {
        setIsFallbackFullscreen(false);
        setIsNativeFullscreen(false);
        unlockOrientation();
      }
      return;
    }

    let enteredNativeFullscreen = false;
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
        enteredNativeFullscreen = Boolean(fullscreenDocument.fullscreenElement);
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
        enteredNativeFullscreen = Boolean(fullscreenDocument.webkitFullscreenElement);
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
        enteredNativeFullscreen = Boolean(fullscreenDocument.msFullscreenElement);
      }
    } catch {
      enteredNativeFullscreen = false;
    }

    if (enteredNativeFullscreen) {
      setIsNativeFullscreen(true);
    } else {
      // MetaMask Mobile and several in-app browsers ignore or reject the
      // Fullscreen API. Keep the control functional with an app-level viewport.
      setIsFallbackFullscreen(true);
    }
    await requestLandscape();
  }, [isFallbackFullscreen, requestLandscape, unlockOrientation]);

  useEffect(() => {
    const revealWalletDialog = () => {
      if (isFullscreen) {
        void handleFullScreen();
      }
    };

    window.addEventListener('cukies:open-wallet-dialog', revealWalletDialog);
    return () => window.removeEventListener('cukies:open-wallet-dialog', revealWalletDialog);
  }, [handleFullScreen, isFullscreen]);

  const openWalletDialog = useCallback(() => {
    window.dispatchEvent(new Event('cukies:open-wallet-dialog'));
  }, []);

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

  const hasDesktopBanner = Boolean(desktopBanner);
  const gameShell = (
    <div
      data-game-layout={isMobileFocus ? 'mobile-focus' : 'standard'}
      className={cn(
        'min-h-0',
        isMobileFocus
          ? 'flex h-full flex-col gap-2'
          : desktopSidebar
            ? 'grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]'
            : 'grid grid-cols-1 gap-6 lg:grid-cols-4',
        !isMobileFocus && !hasDesktopBanner && 'h-full',
        !isMobileFocus && hasDesktopBanner && 'items-start',
      )}
    >
        {isMobileFocus && desktopBanner ? (
          <div data-game-mobile-banner className="shrink-0">
            {desktopBanner}
          </div>
        ) : null}
        
        {/* Left Column: Game */}
        <div
          className={cn(
            'flex min-h-0 flex-col',
            isMobileFocus
              ? 'flex-1 gap-2'
              : desktopSidebar
                ? 'gap-3'
                : 'gap-6 lg:col-span-3',
          )}
        >
          {isMobileFocus && !isFullscreen ? (
            <div className="flex shrink-0 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 gap-2 border-[#35eee2]/35 bg-[#071312] px-3 text-xs font-black text-[#f2eee7] hover:bg-[#0b211e]"
                onClick={() => void handleFullScreen()}
                aria-label="Abrir pantalla completa"
              >
                <Maximize className="h-4 w-4" aria-hidden="true" />
                Pantalla completa
              </Button>
            </div>
          ) : null}

          <div
            ref={gameContainerRef}
            data-game-viewport
            data-game-fullscreen={isFullscreen ? (isNativeFullscreen ? 'native' : 'fallback') : 'off'}
            className={cn(
              'relative flex min-h-0 flex-col overflow-hidden bg-card',
              isMobileFocus
                ? 'aspect-[11/8] w-full flex-none rounded-[8px] border border-[#b7832d]/65'
                : 'rounded-lg border',
              !isMobileFocus && (
                hasDesktopBanner
                  ? desktopSidebar
                    ? 'aspect-[11/8] w-full flex-none rounded-[8px] border-[#b7832d]/65'
                    : 'aspect-[11/8] w-full flex-none'
                  : 'flex-grow'
              ),
              isFallbackFullscreen && 'fixed inset-0 z-[100] !h-[100dvh] !w-screen !flex-none !rounded-none !border-0 [aspect-ratio:auto]',
            )}
          >
            <iframe
              ref={iframeRef}
              src={gameConfig.gameUrl}
              className="block h-full min-h-0 w-full flex-1 overscroll-contain border-0 touch-manipulation"
              title={gameConfig.name}
              allow="clipboard-read; clipboard-write; fullscreen"
              allowFullScreen
              onLoad={handleIframeLoad}
            />
            {isMobileFocus ? (
              <div className="absolute inset-0 z-40 hidden flex-col items-center justify-center bg-[#030c0c]/95 px-6 text-center backdrop-blur-sm portrait:flex">
                <span className="text-4xl text-[#35eee2]" aria-hidden="true">↻</span>
                <strong className="mt-3 font-headline text-xl text-[#f2eee7]">
                  Gira el móvil para jugar
                </strong>
                <span className="mt-2 max-w-xs text-sm leading-5 text-[#aaa8a2]">
                  Treasure Hunt está optimizado para modo horizontal.
                </span>
              </div>
            ) : null}
            {!isMobileFocus ? (
              <div
                className="absolute bottom-0 left-0 z-30 flex items-center gap-2"
                style={{
                  bottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                  left: 'max(0.5rem, env(safe-area-inset-left))',
                }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-black/20 text-white/60 backdrop-blur-sm hover:bg-black/45 hover:text-white"
                  onClick={() => void handleFullScreen()}
                  aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Abrir pantalla completa'}
                  title={isFullscreen ? 'Salir de pantalla completa' : 'Abrir pantalla completa'}
                >
                  {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </Button>
              </div>
            ) : null}
            {isMobileFocus && isFullscreen ? (
              <div
                className="absolute right-0 top-0 z-50 flex items-center gap-2"
                style={{
                  top: 'max(0.5rem, env(safe-area-inset-top))',
                  right: 'max(0.5rem, env(safe-area-inset-right))',
                }}
              >
                {!user ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={openWalletDialog}
                    className="h-11 gap-2 border border-[#35eee2]/40 bg-black/70 px-3 text-xs font-black text-white backdrop-blur-md hover:bg-black/85"
                  >
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                    Conectar wallet
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleFullScreen()}
                  className="h-11 gap-2 border border-white/20 bg-black/70 px-3 text-xs font-black text-white backdrop-blur-md hover:bg-black/85"
                  aria-label="Salir de pantalla completa"
                >
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  Salir
                </Button>
              </div>
            ) : null}
          </div>
          
          {/* Game Instructions */}
          {!isMobileFocus && !desktopSidebar && (
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
        {!isMobileFocus && !desktopSidebar && (
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
        {!isMobileFocus && desktopSidebar ? (
          <div className="min-h-0 lg:col-span-1">{desktopSidebar}</div>
        ) : null}
    </div>
  );

  if (isMobileFocus || !hasDesktopBanner) return gameShell;

  return (
    <div className={cn(desktopSidebar ? 'space-y-3' : 'space-y-5')}>
      {desktopBanner ? <div data-game-desktop-banner>{desktopBanner}</div> : null}
      {gameShell}
      {desktopFooter ? <div data-game-desktop-footer>{desktopFooter}</div> : null}
    </div>
  );
}
