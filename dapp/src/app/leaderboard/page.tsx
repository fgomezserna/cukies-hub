'use client';

import React, { useMemo, useState, useEffect } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { Crown, Lock, Loader2 } from 'lucide-react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import CountdownTimer from '@/components/shared/countdown-timer';
import { LeaderboardPlayer } from '@/types';

interface LeaderboardResponse {
  leaderboard: LeaderboardPlayer[];
  totalCount: number;
  hasMore: boolean;
  gameId?: string;
  period?: string;
}

function LeaderboardView() {
    const { user } = useAuth();
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedGame, setSelectedGame] = useState<string>('all');
    const [selectedPeriod, setSelectedPeriod] = useState<string>('all-time');
    
    const unlockDate = useMemo(() => new Date("2025-07-15T00:00:00"), []);
    const [isTimeLocked, setIsTimeLocked] = useState(new Date() < unlockDate);

    useEffect(() => {
        const timer = setInterval(() => {
        if (new Date() >= unlockDate) {
            setIsTimeLocked(false);
            clearInterval(timer);
        }
        }, 1000);
        return () => clearInterval(timer);
    }, [unlockDate]);

    // Fetch leaderboard data
    const fetchLeaderboard = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                limit: '50',
                offset: '0',
                period: selectedPeriod,
            });
            
            if (selectedGame !== 'all') {
                params.append('gameId', selectedGame);
            }
            
            const response = await fetch(`/api/leaderboard?${params}`);
            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard');
            }
            
            const data: LeaderboardResponse = await response.json();
            setLeaderboardData(data);
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchLeaderboard();
        }
    }, [user, selectedGame, selectedPeriod]);

    const isWalletConnected = !!user;
    const isLocked = isTimeLocked || !isWalletConnected;

    const handleGameChange = (gameId: string) => {
        setSelectedGame(gameId);
    };

    const handlePeriodChange = (period: string) => {
        setSelectedPeriod(period);
    };

    return (
        <div className="relative flex flex-col gap-6">
            <div className={cn("flex flex-col gap-6", isLocked && "blur-sm pointer-events-none")}>
                <div>
                    <h1 className="text-3xl font-bold font-headline">Leaderboard</h1>
                    <p className="text-muted-foreground">See who's on top of the game.</p>
                </div>
                <Card>
                    <CardHeader className="flex-col items-start gap-4 border-b md:flex-row md:items-center md:justify-between">
                        <Tabs value={selectedPeriod} onValueChange={handlePeriodChange} className="w-full md:w-auto">
                            <TabsList className="grid w-full grid-cols-4 md:w-auto">
                                <TabsTrigger value="all-time">All Time</TabsTrigger>
                                <TabsTrigger value="month">Month</TabsTrigger>
                                <TabsTrigger value="week">Week</TabsTrigger>
                                <TabsTrigger value="day">Day</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <div className="flex w-full items-center gap-2 md:w-auto">
                            <Select value={selectedGame} onValueChange={handleGameChange}>
                                <SelectTrigger className="w-full md:w-[180px]">
                                    <SelectValue placeholder="Select a game" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Games</SelectItem>
                                    <SelectItem value="sybil-slayer">Sybil Slayer</SelectItem>
                                    <SelectItem value="hyppie-road">Hyppie Road</SelectItem>
                                    <SelectItem value="tower-builder">Tower Builder</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <span className="ml-2">Loading leaderboard...</span>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[80px] text-center">Rank</TableHead>
                                        <TableHead>Player</TableHead>
                                        <TableHead className="w-[150px] text-center">Rank Change</TableHead>
                                        <TableHead className="text-right">
                                            {selectedGame === 'all' ? 'Total XP' : 'Best Score'}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leaderboardData?.leaderboard.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                No players found for the selected criteria.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        leaderboardData?.leaderboard.map((player) => {
                                            const isCurrentUser = user && player.walletAddress === user.walletAddress;
                                            return (
                                                <TableRow key={player.rank} className={isCurrentUser ? 'bg-primary/10 hover:bg-primary/20' : ''}>
                                                    <TableCell className="font-medium text-lg text-center">{player.rank}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <Avatar>
                                                                <AvatarImage src={player.avatar} data-ai-hint={player.hint} />
                                                                <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <div className='flex items-center gap-2'>
                                                                {user ? (
                                                                    <Link href={`/profile/${player.walletAddress}`} className="font-medium hover:underline">
                                                                        {isCurrentUser ? 'You' : player.name}
                                                                    </Link>
                                                                ) : (
                                                                    <span className="font-medium">{player.name}</span>
                                                                )}
                                                                {player.rank <= 3 && <Badge variant="secondary" className="bg-transparent">{player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}</Badge>}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center justify-center gap-1 font-medium text-muted-foreground">
                                                            <Minus className="h-4 w-4" />
                                                            <span>-</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-primary">
                                                        {player.totalPoints.toLocaleString('en-US')}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
            {isLocked && (
                 <div className="absolute inset-0 flex flex-col items-center justify-start pt-24 text-center bg-background/80 backdrop-blur-sm rounded-lg p-4">
                    <Lock className="h-8 w-8 text-muted-foreground" />
                    {isTimeLocked ? (
                        <>
                            <p className="mt-4 text-lg font-semibold">Leaderboard is Locked</p>
                            <p className="mt-1 text-sm text-muted-foreground">This feature will be available soon. Check back later!</p>
                            <CountdownTimer targetDate={unlockDate.toISOString()} />
                        </>
                    ) : !isWalletConnected ? (
                        <>
                            <p className="mt-4 text-lg font-semibold">Wallet Not Connected</p>
                            <p className="mt-1 text-sm text-muted-foreground">Please connect your wallet to see the leaderboard.</p>
                        </>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export default function LeaderboardPage() {
  return (
    <AppLayout>
      <LeaderboardView />
    </AppLayout>
  )
}