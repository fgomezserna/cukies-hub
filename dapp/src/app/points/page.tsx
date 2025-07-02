'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, Download, Gift, Lock, Search, Shield, Star, Loader2, AlertTriangle, Coins } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { cn, formatPointTransactionForTable } from '@/lib/utils';
import CountdownTimer from '@/components/shared/countdown-timer';
import { PointTransaction } from '@/types';

const streakRewards = [10, 20, 35, 50, 65, 80, 100];

const fullLeaderboardDataRaw = [
    { name: "SybilSlayerPro", avatar: "https://placehold.co/40x40.png", hint: "pro gamer", points: 152340, referralPoints: 5000 },
    { name: "GemHunter", avatar: "https://placehold.co/40x40.png", hint: "gem stone", points: 148970, referralPoints: 2500 },
    { name: "ChainMaster", avatar: "https://placehold.co/40x40.png", hint: "master crown", points: 115750, referralPoints: 8000 },
    { name: "You", avatar: "https://placehold.co/40x40.png", hint: "profile avatar", points: 135600, referralPoints: 1250 },
    { name: "TokenRunner", avatar: "https://placehold.co/40x40.png", hint: "running shoe", points: 121000, referralPoints: 500 },
    { name: "PixelPioneer", avatar: "https://placehold.co/40x40.png", hint: "pixel art", points: 102300, referralPoints: 1200 },
    { name: "CryptoKing", avatar: "https://placehold.co/40x40.png", hint: "king crown", points: 98000, referralPoints: 10000 },
    ...Array.from({ length: 150 }, (_, i) => ({
        name: `Player${i + 1}`,
        avatar: "https://placehold.co/40x40.png",
        hint: "gamer avatar",
        points: 90000 - (i * 501),
        referralPoints: 5000 - (i * 25),
    }))
];

const ITEMS_PER_PAGE = 20;
const LEADERBOARD_LIMIT = 100;

// Helper to check if two dates are on the same calendar day
const isSameDay = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

// Helper to check if a date was yesterday
const isYesterday = (date: Date) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
};


function PointsView() {
  const { toast } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  
  const unlockDate = useMemo(() => new Date("2025-06-31T00:00:00"), []);
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

  const isStarterQuestCompleted = useMemo(() => {
    if (!user) return false;
    return user.completedQuests.some(cq => cq.quest.isStarter);
    }, [user]);

  const [dailyStreak, setDailyStreak] = useState(0);
  const [canClaim, setCanClaim] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // --- Point transactions state ---
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([]);
  const [hasMorePointTransactions, setHasMorePointTransactions] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionsOffset, setTransactionsOffset] = useState(0);

  // --- Infinite Scroll State ---
  const pointsObserver = useRef<HTMLDivElement>(null);
  const pointsContainerRef = useRef<HTMLDivElement>(null);

  const fullLeaderboardData = useMemo(() => fullLeaderboardDataRaw
    .map(p => ({ ...p, totalPoints: p.points + p.referralPoints }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((p, i) => ({ ...p, rank: i + 1 })), []);
  
  const [visiblePlayers, setVisiblePlayers] = useState(fullLeaderboardData.slice(0, ITEMS_PER_PAGE));
  const [hasMorePlayers, setHasMorePlayers] = useState(fullLeaderboardData.length > ITEMS_PER_PAGE && ITEMS_PER_PAGE < LEADERBOARD_LIMIT);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const leaderboardObserver = useRef<HTMLDivElement>(null);
  const leaderboardContainerRef = useRef<HTMLDivElement>(null);

  const filteredLeaderboard = useMemo(() => {
    if (!searchTerm) return [];
    return fullLeaderboardData.filter(player =>
      player.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, fullLeaderboardData]);

  const playersToDisplay = searchTerm ? filteredLeaderboard : visiblePlayers;



  const loadMoreTransactions = useCallback(async () => {
    if (!hasMorePointTransactions || isLoadingTransactions || !user) return;
    
    setIsLoadingTransactions(true);
    try {
      const response = await fetch(`/api/points?walletAddress=${user.walletAddress}&limit=${ITEMS_PER_PAGE}&offset=${transactionsOffset}`);
      if (!response.ok) throw new Error('Failed to fetch point transactions');
      
      const data = await response.json();
      setPointTransactions(prev => [...prev, ...data.transactions]);
      setHasMorePointTransactions(data.hasMore);
      setTransactionsOffset(prev => prev + ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error loading more point transactions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load more point transactions',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [hasMorePointTransactions, isLoadingTransactions, transactionsOffset, user?.walletAddress, toast]);

  const loadMorePlayers = useCallback(() => {
    if (isLoadingPlayers || searchTerm) return;
    setIsLoadingPlayers(true);
    setTimeout(() => {
      const currentLength = visiblePlayers.length;
      const newPlayers = fullLeaderboardData.slice(currentLength, currentLength + ITEMS_PER_PAGE);
      setVisiblePlayers(prev => [...prev, ...newPlayers]);
      if (currentLength + ITEMS_PER_PAGE >= LEADERBOARD_LIMIT || currentLength + ITEMS_PER_PAGE >= fullLeaderboardData.length) {
        setHasMorePlayers(false);
      }
      setIsLoadingPlayers(false);
    }, 500);
  }, [isLoadingPlayers, visiblePlayers.length, fullLeaderboardData, searchTerm]);
  
  const createObserver = (
    callback: () => void,
    hasMore: boolean,
    isLoading: boolean,
    targetRef: React.RefObject<HTMLDivElement>,
    rootRef: React.RefObject<HTMLDivElement>
  ) => {
    const target = targetRef.current;
    const root = rootRef.current;
    if (!target || !root) return () => {};

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          callback();
        }
      },
      { root, threshold: 1.0 }
    );

    observer.observe(target);

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  };

  useEffect(() => {
    const cleanup = createObserver(loadMoreTransactions, hasMorePointTransactions, isLoadingTransactions, pointsObserver, pointsContainerRef);
    return cleanup;
  }, [hasMorePointTransactions, isLoadingTransactions, loadMoreTransactions]);
  
  useEffect(() => {
    if (searchTerm) return;
    const cleanup = createObserver(loadMorePlayers, hasMorePlayers, isLoadingPlayers, leaderboardObserver, leaderboardContainerRef);
    return cleanup;
  }, [hasMorePlayers, isLoadingPlayers, loadMorePlayers, searchTerm]);

  // Load point transactions when user is available
  useEffect(() => {
    if (!user || isAuthLoading) return;
    
    const loadInitialTransactions = async () => {
      setIsLoadingTransactions(true);
      try {
        const response = await fetch(`/api/points?walletAddress=${user.walletAddress}&limit=${ITEMS_PER_PAGE}&offset=0`);
        if (!response.ok) throw new Error('Failed to fetch point transactions');
        
        const data = await response.json();
        setPointTransactions(data.transactions);
        setHasMorePointTransactions(data.hasMore);
        setTransactionsOffset(ITEMS_PER_PAGE);
      } catch (error) {
        console.error('Error loading point transactions:', error);
        toast({
          title: 'Error',
          description: 'Failed to load point transactions',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingTransactions(false);
      }
    };
    
    loadInitialTransactions();
  }, [user?.walletAddress, isAuthLoading, toast]);
  
  // Load state from localStorage on mount
  useEffect(() => {
    if (!isStarterQuestCompleted) return;

    let currentStreak = parseInt(localStorage.getItem('dailyStreak') || '0', 10);
    const lastClaimTimestamp = localStorage.getItem('lastClaimTimestamp');

    if (lastClaimTimestamp) {
      const lastClaimDate = new Date(parseInt(lastClaimTimestamp));
      const today = new Date();

      if (isSameDay(lastClaimDate, today)) {
        setCanClaim(false);
      } else if (isYesterday(lastClaimDate)) {
        setCanClaim(true);
        if (currentStreak >= 7) currentStreak = 0;
      } else {
        setCanClaim(true);
        currentStreak = 0;
      }
    } else {
      setCanClaim(true);
      currentStreak = 0;
    }
    
    setDailyStreak(currentStreak);
    localStorage.setItem('dailyStreak', currentStreak.toString());

  }, []);

  const currentReward = streakRewards[dailyStreak];

  const handleClaim = useCallback(async () => {
    if (!canClaim || !isStarterQuestCompleted || !user) return;

    try {
      const response = await fetch('/api/points/daily-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: user.walletAddress,
          amount: currentReward,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to claim daily drop.');
      }

      toast({
        title: "Daily Drop Claimed!",
        description: `You earned ${currentReward} XP. Come back tomorrow!`,
      });

      const newStreak = dailyStreak + 1;
      const finalStreak = newStreak >= 7 ? 0 : newStreak;
      setDailyStreak(finalStreak);
      localStorage.setItem('dailyStreak', finalStreak.toString());
      
      localStorage.setItem('lastClaimTimestamp', new Date().getTime().toString());
      setCanClaim(false);

      // Refresh point transactions to show the new entry
      try {
        const refreshResponse = await fetch(`/api/points?walletAddress=${user.walletAddress}&limit=${ITEMS_PER_PAGE}&offset=0`);
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          setPointTransactions(refreshData.transactions);
          setHasMorePointTransactions(refreshData.hasMore);
          setTransactionsOffset(ITEMS_PER_PAGE);
        }
      } catch (refreshError) {
        console.error('Error refreshing transactions:', refreshError);
      }

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to claim daily drop',
        variant: 'destructive',
      });
    }
  }, [canClaim, dailyStreak, isStarterQuestCompleted, currentReward, user, toast]);

  const getButtonState = () => {
      if (!user) {
          return { text: 'Connect Wallet', disabled: true, icon: Lock };
      }
      if (!isStarterQuestCompleted) {
          return { text: 'Locked', disabled: true, icon: Lock };
      }
      return { text: `Claim ${currentReward} XP`, disabled: false, icon: null };
  }

  const buttonState = getButtonState();

  const getDailyDropDescription = () => {
    if (!user) {
        return 'Connect your wallet to participate in the Daily Drop.'
    }
    if (!isStarterQuestCompleted) {
      return 'Complete the "Get Started" quest to unlock.';
    }
    if (!canClaim) {
      return `You've claimed your reward for today. Current streak: ${dailyStreak} day(s).`;
    }
    return `You're on a ${dailyStreak} day streak! Claim your reward.`;
  }

  const isWalletConnected = !!user;

  const isLocked = useMemo(() => {
    return isTimeLocked || !isWalletConnected;
  }, [isTimeLocked, isWalletConnected]);

  const isLoading = isAuthLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const formattedTransactions = pointTransactions.map(formatPointTransactionForTable);

  return (
    <div className="relative h-full">
        <div className={cn("grid flex-1 gap-4 overflow-auto p-4 sm:grid-cols-2 lg:grid-cols-3 h-full", isLocked && 'blur-sm pointer-events-none')}>
            <div className="grid auto-rows-max items-start gap-4 lg:col-span-2 lg:gap-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Points History</CardTitle>
                            <CardDescription>Track your points earned and spent.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div ref={pointsContainerRef} className="relative h-[600px] overflow-y-auto custom-scrollbar">
                            <Table>
                                <TableHeader className="sticky top-0 bg-card z-10">
                                    <TableRow>
                                        <TableHead>Activity</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Points</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {formattedTransactions.length === 0 && !isLoadingTransactions ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                                No point transactions found. Complete some quests to start earning points!
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        formattedTransactions.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">{item.reason}</TableCell>
                                                <TableCell className="text-muted-foreground">{item.date}</TableCell>
                                                <TableCell className={`text-right font-medium ${item.points.startsWith('+') ? 'text-green-500' : 'text-destructive'}`}>
                                                    {item.points}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    {hasMorePointTransactions && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center p-0">
                                                <div ref={pointsObserver} className="flex justify-center items-center py-4">
                                                    {isLoadingTransactions && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                            <CardTitle>Leaderboard</CardTitle>
                            <div className="relative w-full md:max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by player..."
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div ref={leaderboardContainerRef} className="relative h-[600px] overflow-y-auto custom-scrollbar">
                            <Table>
                                <TableHeader className="sticky top-0 bg-card z-10">
                                    <TableRow>
                                        <TableHead className="w-[80px] text-center">Rank</TableHead>
                                        <TableHead>Hyppie Player</TableHead>
                                        <TableHead className="text-right">Points (XP)</TableHead>
                                        <TableHead className="text-right">Referral Points</TableHead>
                                        <TableHead className="text-right">Total Points</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {playersToDisplay.map((player) => (
                                        <TableRow key={player.rank} className={player.name === 'You' ? 'bg-primary/10 hover:bg-primary/20' : ''}>
                                            <TableCell className="font-medium text-lg text-center">{player.rank}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={player.avatar} data-ai-hint={player.hint} />
                                                        <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className='flex items-center gap-2'>
                                                        {isAuthLoading ? (
                                                          <span className="font-medium">{player.name}</span>
                                                        ) : (
                                                          <Link href={`/profile/${player.name}`} className="font-medium hover:underline">
                                                            {player.name}
                                                          </Link>
                                                        )}
                                                        {player.rank <= 3 && <Badge variant="secondary" className="bg-transparent">{player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}</Badge>}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{player.points.toLocaleString('en-US')}</TableCell>
                                            <TableCell className="text-right font-mono">{player.referralPoints.toLocaleString('en-US')}</TableCell>
                                            <TableCell className="text-right font-mono text-primary font-bold">{player.totalPoints.toLocaleString('en-US')}</TableCell>
                                        </TableRow>
                                    ))}
                                    {!searchTerm && hasMorePlayers && (
                                          <TableRow>
                                              <TableCell colSpan={5} className="text-center p-0">
                                                  <div ref={leaderboardObserver} className="flex justify-center items-center py-4">
                                                      {isLoadingPlayers && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
                                                  </div>
                                              </TableCell>
                                          </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="grid auto-rows-max items-start gap-4 lg:gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Daily Drop</CardTitle>
                        <CardDescription>{getDailyDropDescription()}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={handleClaim} disabled={buttonState.disabled} className="w-full">
                            {buttonState.icon && <buttonState.icon className="mr-2 h-4 w-4" />}
                            {buttonState.text}
                        </Button>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Leaderboard</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Additional content for leaderboard section */}
                    </CardContent>
                </Card>
            </div>
        </div>
        {isLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-start pt-24 text-center bg-background/80 backdrop-blur-sm rounded-lg p-4 z-10">
                <Lock className="h-8 w-8 text-muted-foreground" />
                {isTimeLocked ? (
                    <>
                        <p className="mt-4 text-lg font-semibold">Points are Locked</p>
                        <p className="mt-1 text-sm text-muted-foreground">This feature will be available soon. Check back later!</p>
                        <CountdownTimer targetDate={unlockDate.toISOString()} />
                    </>
                ) : !isWalletConnected ? (
                    <>
                        <p className="mt-4 text-lg font-semibold">Connect Your Wallet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Please connect your wallet to view your points and leaderboard.</p>
                    </>
                ) : null}
            </div>
        )}
    </div>
  );
}

function PointsPage() {
    return (
        <AppLayout>
            <PointsView />
        </AppLayout>
    );
}

export default PointsPage;
