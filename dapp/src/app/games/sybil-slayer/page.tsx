'use client';

import React, { useRef } from 'react';
import { useParentConnection } from '@hyppie/game-bridge';
import { useAuth } from '@/providers/auth-provider';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Landmark, Gem, Maximize, ExternalLink, MessageCircle, ShieldCheck, Zap, HandCoins, Send } from 'lucide-react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


// Define a type for the element to handle vendor prefixes for fullscreen
interface FullscreenElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

export default function SybilSlayerPage() {
  const gameContainerRef = useRef<FullscreenElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, isLoading } = useAuth();

  // Usa el hook para enviar datos de autenticación al juego
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

  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
        
        {/* Left Column: Game */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div ref={gameContainerRef} className="bg-card flex-grow flex flex-col relative overflow-hidden rounded-lg border">
            <iframe
              ref={iframeRef}
              src={`${process.env.GAME_SYBILSLASH}`}
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
          </div>
          <Card>
            <CardContent className="p-4 flex flex-wrap justify-around items-center text-center gap-4">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <span>PROVABLY FAIR</span>
                </div>
                <Separator orientation="vertical" className="h-6 hidden sm:block"/>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                    <Zap className="h-5 w-5 text-primary" />
                    <span>INSTANT PAYMENTS</span>
                </div>
                <Separator orientation="vertical" className="h-6 hidden sm:block"/>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                    <HandCoins className="h-5 w-5 text-primary" />
                    <span>NON CUSTODIAL</span>
                </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Stats & Collections */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">Total Bankroll Value</CardTitle>
                <Link href="#" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Verify <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                    <Landmark className="h-6 w-6 text-primary" />
                </div>
                <div className="text-2xl font-bold font-mono">$11.7M</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium">Gems Mined by All Users</CardTitle>
            </CardHeader>
            <CardContent>
               <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                    <Gem className="h-6 w-6 text-primary" />
                </div>
                <div className="text-2xl font-bold font-mono">$7.8M</div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-grow">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Gem className="h-4 w-4"/> Gem Collection</CardTitle>
                <Link href="#" className="text-xs text-primary hover:underline">View All</Link>
              </div>
              <CardDescription>Total: $1,066.00</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-muted-foreground/30" />
                    <Gem className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                  <span className="font-mono text-sm">$1,900.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-muted-foreground/30" />
                    <Gem className="h-4 w-4 text-muted-foreground/30" />
                    <Gem className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                  <span className="font-mono text-sm">$1,400.00</span>
                </div>
                <div className="flex justify-between items-center">
                   <div className="flex items-center gap-1">
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                  <span className="font-mono text-sm">$1,100.00</span>
                </div>
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-1">
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                    <Gem className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-mono text-sm">$930.00</span>
                </div>
              </div>
            </CardContent>
          </Card>
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
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="king crown" />
                    <AvatarFallback>CK</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-bold text-primary">CryptoKing</p>
                    <div className="bg-muted p-3 rounded-lg mt-1">
                      <p>This game is awesome! 🔥</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 text-sm justify-end">
                   <div className="flex-1">
                    <p className="font-bold text-right">You</p>
                    <div className="bg-primary text-primary-foreground p-3 rounded-lg mt-1">
                      <p>I know right?! Just got a huge win!</p>
                    </div>
                  </div>
                   <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="profile avatar" />
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                </div>
                 <div className="flex gap-3 text-sm">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="diamond hands" />
                    <AvatarFallback>DH</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-bold text-primary">DiamondHands</p>
                    <div className="bg-muted p-3 rounded-lg mt-1">
                      <p>LFG! 🚀</p>
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
