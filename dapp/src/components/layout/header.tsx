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
import Logo from '@/components/icons/logo';
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
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
      >
        <PanelLeft />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>

      {(isMobile || state === 'collapsed') && (
        <div className="flex items-center gap-2">
            <Logo />
            <span className="font-bold font-headline text-lg">HyppieLiquid</span>
        </div>
      )}

      <div className="flex-1">
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full group">
                <Bell />
                <span className="absolute top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 group-hover:bg-destructive"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary group-hover:bg-destructive"></span>
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <CardHeader className="pb-4">
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>You have 1 unread message.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex items-start gap-4">
                      <Avatar className="h-8 w-8">
                          <AvatarImage src="https://placehold.co/100x100.png" alt="Avatar" data-ai-hint="logo icon"/>
                          <AvatarFallback>HL</AvatarFallback>
                      </Avatar>
                      <div className="grid gap-1">
                          <p className="text-sm font-medium">Welcome to HyppieLiquid!</p>
                          <p className="text-sm text-muted-foreground">Complete your first quest to earn bonus points.</p>
                      </div>
                  </div>
                  <Button variant="link" className="w-full" asChild>
                    <Link href="/quests">View all</Link>
                  </Button>
                </CardContent>
            </PopoverContent>
          </Popover>
        )}

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.profilePictureUrl ?? "https://placehold.co/100x100.png"} alt={user.username ?? "user"} data-ai-hint="profile avatar" />
                  <AvatarFallback>{user.username?.slice(0,1).toUpperCase() ?? "U"}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user.username ?? "My Account"}</DropdownMenuLabel>
              <div className="px-2 pt-1 pb-2">
                <p className="text-xs text-muted-foreground">Rank</p>
                <p className="font-semibold text-primary">{userRank}</p>
                <p className="text-xs text-muted-foreground mt-2">XP</p>
                <p className="font-semibold font-mono">{userXP.toLocaleString()}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Wallet className="mr-2 h-4 w-4" />
                <span>My Wallet</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => disconnect()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Disconnect</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button onClick={() => connect({ connector: connectors[0] })} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/50 hover:shadow-md hover:shadow-primary/50 transition-all">
            <Wallet className="mr-2 h-4 w-4" />
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  );
}
