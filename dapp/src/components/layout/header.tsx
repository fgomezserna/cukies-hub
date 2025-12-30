'use client';

import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Bell, Wallet, Settings, LogOut, PanelLeft, Zap } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/providers/auth-provider';
import { useConnect, useDisconnect } from 'wagmi';
import { useTronLink } from '@/hooks/use-tronlink';



const ranks = [
  { xp: 50000, name: 'Hyppie Master' },
  { xp: 20000, name: 'Hyperliquid Veteran' },
  { xp: 10000, name: 'Sybil Slayer' },
  { xp: 5000, name: 'Experimented Hyppie' },
  { xp: 2500, name: 'Explorer' },
];

const getRank = (xp: number): string => {
  const userRank = ranks.find(rank => xp >= rank.xp);
  return userRank ? userRank.name : 'No Rank';
};

export default function Header() {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const { user, isLoading: isAuthLoading, isWaitingForApproval } = useAuth();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { connect: connectTron, isInstalled: isTronInstalled } = useTronLink();
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  
  // This would come from user data in a real app
  const userXP = user?.xp ?? 0;
  const userRank = getRank(userXP);

  const handleConnectEVM = () => {
    setIsWalletDialogOpen(false);
    if (connectors.length > 0) {
      connect({ connector: connectors[0] });
    }
  };

  const handleConnectTron = async () => {
    setIsWalletDialogOpen(false);
    try {
      await connectTron();
    } catch (error) {
      console.error('Failed to connect TronLink:', error);
    }
  };

  if (isAuthLoading) {
    return (
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <div className="flex-1"></div>
        <Button variant="outline" disabled>
          <p>Loading...</p>
        </Button>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-4 border-b border-pink-600/20 bg-black/25 backdrop-blur-md shadow-lg shadow-pink-600/10 px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="hover:bg-pink-600/10 hover:text-pink-500 transition-all duration-300"
      >
        <PanelLeft />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>

      {(isMobile || state === 'collapsed') && (
        <div className="flex items-center gap-2 group h-full">
            <Image src="/Cukie_logo_first.png" alt="Cukies World" width={140} height={40} className="object-contain max-h-[48px] w-auto" />
        </div>
      )}

      <div className="flex-1">
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full group hover:bg-pink-600/10 transition-all duration-300">
                <Bell className="group-hover:text-pink-500 transition-colors" />
                <span className="absolute top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 border-2 border-pink-600/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-pink-600/10" align="end">
                <CardHeader className="pb-4">
                  <CardTitle className="text-foreground">🔔 Notifications</CardTitle>
                  <CardDescription>You have 1 unread message.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex items-start gap-4 p-3 rounded-lg bg-pink-600/5 border border-pink-600/10">
                      <Avatar className="h-10 w-10 border-2 border-pink-500/30">
                          <AvatarImage src="https://placehold.co/100x100.png" alt="Avatar" data-ai-hint="logo icon"/>
                          <AvatarFallback className="bg-gradient-to-br from-pink-500 to-pink-600 text-white font-bold">HL</AvatarFallback>
                      </Avatar>
                      <div className="grid gap-1">
                          <p className="text-sm font-medium text-foreground">Welcome to Cukies World! 🎉</p>
                          <p className="text-sm text-muted-foreground">Complete your first quest to earn bonus points.</p>
                      </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full border-pink-600/30 bg-pink-600/10 hover:bg-pink-600/20 hover:border-pink-500/50 transition-all duration-300" 
                    asChild
                  >
                    <Link href="/quests">✨ View All</Link>
                  </Button>
                </CardContent>
            </PopoverContent>
          </Popover>
        )}

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full group hover:bg-pink-600/10 transition-all duration-300">
                <Avatar className="h-10 w-10 border-2 border-pink-500/30 group-hover:border-pink-500/60 transition-all duration-300">
                  <AvatarImage src={user.profilePictureUrl ?? "https://placehold.co/100x100.png"} alt={user.username ?? "user"} data-ai-hint="profile avatar" />
                  <AvatarFallback className="bg-gradient-to-br from-pink-500 to-pink-600 text-white font-bold">
                    {user.username?.slice(0,1).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-2 border-pink-600/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-pink-600/10">
              <DropdownMenuLabel className="text-base font-bold text-foreground">
                {user.username 
                  ? user.username.length > 15 
                    ? `${user.username.slice(0, 15)}...` 
                    : user.username
                  : "My Account"}
              </DropdownMenuLabel>
              <div className="px-3 pt-2 pb-3 space-y-3">
                <div className="p-3 rounded-lg bg-gradient-to-r from-pink-600/10 to-pink-600/10 border border-pink-500/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Rank</p>
                  <p className="font-bold text-pink-500 text-sm">{userRank}</p>
                </div>
                <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-400/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">XP</p>
                  <p className="font-bold font-mono text-blue-400 text-lg">{userXP.toLocaleString()}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="bg-pink-600/20" />
              <DropdownMenuItem disabled className="opacity-50">
                <Wallet className="mr-3 h-4 w-4 text-gray-400" />
                <span>My Wallet</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="hover:bg-pink-600/10 transition-colors">
                <Link href="/settings">
                  <Settings className="mr-3 h-4 w-4 text-pink-500" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-pink-600/20" />
              <DropdownMenuItem 
                onClick={() => disconnect()} 
                className="hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
              >
                <LogOut className="mr-3 h-4 w-4" />
                <span>Disconnect</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button 
              onClick={() => !isWaitingForApproval && setIsWalletDialogOpen(true)} 
              disabled={isWaitingForApproval}
              className={`${
                isWaitingForApproval 
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 cursor-not-allowed" 
                  : "bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 hover:scale-105 hover:shadow-xl hover:shadow-pink-600/40"
              } text-white font-bold px-6 py-2 rounded-xl shadow-lg transition-all duration-300 ${
                isWaitingForApproval ? "shadow-amber-500/30 animate-pulse" : "shadow-pink-600/30"
              }`}
            >
              {isWaitingForApproval ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent md:mr-2" />
                  <span className="hidden md:inline">Waiting for Approval...</span>
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Connect Wallet</span>
                </>
              )}
            </Button>

            <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
              <DialogContent className="sm:max-w-md border-2 border-pink-600/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-pink-600/10">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-foreground">
                    Choose Wallet Type
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Select your preferred wallet to connect
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Button
                    onClick={handleConnectEVM}
                    className="w-full h-auto p-6 flex flex-col items-start gap-3 bg-gradient-to-r from-blue-600/10 to-purple-600/10 hover:from-blue-600/20 hover:to-purple-600/20 border-2 border-blue-500/30 hover:border-blue-500/50 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                        <Wallet className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-lg text-foreground">EVM Wallets</div>
                        <div className="text-sm text-muted-foreground">MetaMask, WalletConnect, etc.</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    onClick={handleConnectTron}
                    disabled={!isTronInstalled}
                    className="w-full h-auto p-6 flex flex-col items-start gap-3 bg-gradient-to-r from-yellow-600/10 to-orange-600/10 hover:from-yellow-600/20 hover:to-orange-600/20 border-2 border-yellow-500/30 hover:border-yellow-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600">
                        <Zap className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-lg text-foreground">TronLink</div>
                        <div className="text-sm text-muted-foreground">
                          {isTronInstalled ? 'Connect your TronLink wallet' : 'Please install TronLink extension'}
                        </div>
                      </div>
                    </div>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </header>
  );
}
