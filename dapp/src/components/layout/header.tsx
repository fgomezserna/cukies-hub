'use client';

import React from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Bell, Wallet, Settings, LogOut, PanelLeft } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import hyppieletters from '@/assets/hyppieletters.png';
import hyppieicon from '@/assets/hyppiesymbol.png';
import { useAuth } from '@/providers/auth-provider';
import { useConnect, useDisconnect } from 'wagmi';



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
  const { user, isLoading: isAuthLoading } = useAuth();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  
  // This would come from user data in a real app
  const userXP = user?.xp ?? 0;
  const userRank = getRank(userXP);

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
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-4 border-b border-green-500/20 bg-black/25 backdrop-blur-md shadow-lg shadow-green-500/10 px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="hover:bg-green-500/10 hover:text-green-400 transition-all duration-300"
      >
        <PanelLeft />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>

      {(isMobile || state === 'collapsed') && (
        <div className="flex items-center gap-2 group">
            <Image src={hyppieicon} alt="HyppieLiquid" width={39} height={20} />
            <Image src={hyppieletters} alt="HyppieLiquid" height={39} />
        </div>
      )}

      <div className="flex-1">
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full group hover:bg-green-500/10 transition-all duration-300">
                <Bell className="group-hover:text-green-400 transition-colors" />
                <span className="absolute top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 border-2 border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-green-500/10" align="end">
                <CardHeader className="pb-4">
                  <CardTitle className="text-foreground">🔔 Notifications</CardTitle>
                  <CardDescription>You have 1 unread message.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex items-start gap-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                      <Avatar className="h-10 w-10 border-2 border-green-400/30">
                          <AvatarImage src="https://placehold.co/100x100.png" alt="Avatar" data-ai-hint="logo icon"/>
                          <AvatarFallback className="bg-gradient-to-br from-green-400 to-emerald-500 text-white font-bold">HL</AvatarFallback>
                      </Avatar>
                      <div className="grid gap-1">
                          <p className="text-sm font-medium text-foreground">Welcome to HyppieLiquid! 🎉</p>
                          <p className="text-sm text-muted-foreground">Complete your first quest to earn bonus points.</p>
                      </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full border-green-500/30 bg-green-500/10 hover:bg-green-500/20 hover:border-green-400/50 transition-all duration-300" 
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
              <Button variant="ghost" className="relative h-10 w-10 rounded-full group hover:bg-green-500/10 transition-all duration-300">
                <Avatar className="h-10 w-10 border-2 border-green-400/30 group-hover:border-green-400/60 transition-all duration-300">
                  <AvatarImage src={user.profilePictureUrl ?? "https://placehold.co/100x100.png"} alt={user.username ?? "user"} data-ai-hint="profile avatar" />
                  <AvatarFallback className="bg-gradient-to-br from-green-400 to-emerald-500 text-white font-bold">
                    {user.username?.slice(0,1).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-2 border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-green-500/10">
              <DropdownMenuLabel className="text-base font-bold text-foreground">
                👤 {user.username ?? "My Account"}
              </DropdownMenuLabel>
              <div className="px-3 pt-2 pb-3 space-y-3">
                <div className="p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-400/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Rank</p>
                  <p className="font-bold text-green-400 text-sm">{userRank}</p>
                </div>
                <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-400/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">XP</p>
                  <p className="font-bold font-mono text-blue-400 text-lg">{userXP.toLocaleString()}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="bg-green-500/20" />
              <DropdownMenuItem disabled className="opacity-50">
                <Wallet className="mr-3 h-4 w-4 text-gray-400" />
                <span>💼 My Wallet</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="hover:bg-green-500/10 transition-colors">
                <Link href="/settings">
                  <Settings className="mr-3 h-4 w-4 text-green-400" />
                  <span>⚙️ Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-green-500/20" />
              <DropdownMenuItem 
                onClick={() => disconnect()} 
                className="hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
              >
                <LogOut className="mr-3 h-4 w-4" />
                <span>🚪 Disconnect</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button 
            onClick={() => connect({ connector: connectors[0] })} 
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold px-6 py-2 rounded-xl shadow-lg shadow-green-500/30 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/40"
          >
            <Wallet className="mr-2 h-4 w-4" />
            💰 Connect Wallet
          </Button>
        )}
      </div>
    </header>
  );
}
