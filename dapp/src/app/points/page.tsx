'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Download, Gift, Lock, Search, Shield, Star, Loader2, AlertTriangle, Coins, TrendingUp, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { cn, formatPointTransactionForTable } from '@/lib/utils';
import CountdownTimer from '@/components/shared/countdown-timer';
import { PointTransaction, UserStats, LeaderboardPlayer } from '@/types';

const streakRewards = [10, 20, 35, 50, 65, 80, 100];

const ITEMS_PER_PAGE = 20;
const LEADERBOARD_LIMIT = 100;

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
  const [isLoadingDailyStatus, setIsLoadingDailyStatus] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // --- User Stats State ---
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoadingUserStats, setIsLoadingUserStats] = useState(false);

  // --- Point transactions state ---
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([]);
  const [hasMorePointTransactions, setHasMorePointTransactions] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionsOffset, setTransactionsOffset] = useState(0);

  // --- Leaderboard State ---
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [hasMorePlayers, setHasMorePlayers] = useState(true);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [leaderboardOffset, setLeaderboardOffset] = useState(0);

  // --- Infinite Scroll State ---
  const pointsObserver = useRef<HTMLDivElement>(null);
  const pointsContainerRef = useRef<HTMLDivElement>(null);
  const leaderboardObserver = useRef<HTMLDivElement>(null);
  const leaderboardContainerRef = useRef<HTMLDivElement>(null);

  const filteredLeaderboard = useMemo(() => {
    if (!searchTerm) return [];
    return leaderboard.filter(player =>
      player.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, leaderboard]);

  const playersToDisplay = searchTerm ? filteredLeaderboard : leaderboard;

  // Load user stats
  useEffect(() => {
    if (!user || isAuthLoading) return;

    const loadUserStats = async () => {
      setIsLoadingUserStats(true);
      try {
        const response = await fetch(`/api/user/stats?walletAddress=${user.walletAddress}`);
        if (!response.ok) throw new Error('Failed to fetch user stats');
        
        const data = await response.json();
        setUserStats(data);
      } catch (error) {
        console.error('Error loading user stats:', error);
        toast({
          title: 'Error',
          description: 'Failed to load user stats',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingUserStats(false);
      }
    };

    loadUserStats();
  }, [user?.walletAddress, isAuthLoading, toast]);

  // Load leaderboard
  const loadMorePlayers = useCallback(async () => {
    if (!hasMorePlayers || isLoadingPlayers) return;
    
    setIsLoadingPlayers(true);
    try {
      const response = await fetch(`/api/leaderboard?limit=${ITEMS_PER_PAGE}&offset=${leaderboardOffset}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      
      const data = await response.json();
      
      // Mark current user in leaderboard
      const updatedLeaderboard = data.leaderboard.map((player: LeaderboardPlayer) => ({
        ...player,
        name: user && player.walletAddress === user.walletAddress ? 'You' : player.name,
      }));
      
      setLeaderboard(prev => [...prev, ...updatedLeaderboard]);
      setHasMorePlayers(data.hasMore);
      setLeaderboardOffset(prev => prev + ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to load leaderboard',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPlayers(false);
    }
  }, [hasMorePlayers, isLoadingPlayers, leaderboardOffset, user?.walletAddress, toast]);

  // Load initial leaderboard
  useEffect(() => {
    if (!user || isAuthLoading) return;
    
    const loadInitialLeaderboard = async () => {
      setIsLoadingPlayers(true);
      try {
        const response = await fetch(`/api/leaderboard?limit=${ITEMS_PER_PAGE}&offset=0`);
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        
        const data = await response.json();
        
        // Mark current user in leaderboard
        const updatedLeaderboard = data.leaderboard.map((player: LeaderboardPlayer) => ({
          ...player,
          name: player.walletAddress === user.walletAddress ? 'You' : player.name,
        }));
        
        setLeaderboard(updatedLeaderboard);
        setHasMorePlayers(data.hasMore);
        setLeaderboardOffset(ITEMS_PER_PAGE);
      } catch (error) {
        console.error('Error loading initial leaderboard:', error);
        toast({
          title: 'Error',
          description: 'Failed to load leaderboard',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingPlayers(false);
      }
    };
    
    loadInitialLeaderboard();
  }, [user?.walletAddress, isAuthLoading, toast]);

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
  
  // Load daily status from API
  useEffect(() => {
    if (!user || !isStarterQuestCompleted || isAuthLoading) return;

    const loadDailyStatus = async () => {
      setIsLoadingDailyStatus(true);
      try {
        const response = await fetch(`/api/points/daily-status?walletAddress=${user.walletAddress}`);
        if (!response.ok) throw new Error('Failed to fetch daily status');
        
        const data = await response.json();
        setCanClaim(data.canClaim);
        setDailyStreak(data.currentStreak);
      } catch (error) {
        console.error('Error loading daily status:', error);
        toast({
          title: 'Error',
          description: 'Failed to load daily status',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingDailyStatus(false);
      }
    };

    loadDailyStatus();
  }, [user?.walletAddress, isStarterQuestCompleted, isAuthLoading, toast]);

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

      // Update local state with new data from server
      setDailyStreak(result.newStreak);
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

      // Refresh user stats
      try {
        const statsResponse = await fetch(`/api/user/stats?walletAddress=${user.walletAddress}`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setUserStats(statsData);
        }
      } catch (statsError) {
        console.error('Error refreshing user stats:', statsError);
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
      if (isLoadingDailyStatus) {
          return { text: 'Loading...', disabled: true, icon: null };
      }
      if (!canClaim) {
          return { text: 'Claimed Today', disabled: true, icon: null };
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
    return isTimeLocked || !isWalletConnected || !isStarterQuestCompleted;
  }, [isTimeLocked, isWalletConnected, isStarterQuestCompleted]);

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
    <div className="relative flex flex-col gap-8">
      <div className={cn("flex flex-col gap-8", isLocked && 'blur-sm pointer-events-none')}>
        {/* Header moderno */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            💰 Points Center
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Manage your points, review your history and compete in the global ranking
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* User Stats Cards - Estilo consistente */}
            {userStats && (
              <div className="lg:col-span-3">
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Tier Card */}
                  <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 hover:border-green-400/40">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400 to-pink-500 opacity-5" />
                    
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        🛡️ Tier
                      </CardTitle>
                      <div className="p-2 rounded-lg bg-gradient-to-br from-purple-400 to-pink-500 bg-opacity-10">
                        <Shield className="h-5 w-5 text-purple-400" />
                      </div>
                    </CardHeader>
                    <CardContent className="relative">
                      <div className={cn("text-3xl font-bold font-headline text-foreground", userStats.stats.tierColor)}>
                        {userStats.stats.tier}
                      </div>
                      <div className="absolute -bottom-1 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-purple-400/60 to-transparent" />
                    </CardContent>
                  </Card>

                  {/* Position Card */}
                  <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 hover:border-green-400/40">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-cyan-500 opacity-5" />
                    
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        📈 Position
                      </CardTitle>
                      <div className="p-2 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-500 bg-opacity-10">
                        <TrendingUp className="h-5 w-5 text-blue-400" />
                      </div>
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="flex items-center gap-2">
                        <div className="text-3xl font-bold font-headline text-blue-400">
                          #{userStats.stats.ranking}
                        </div>
                        <div className={cn("flex items-center text-xs px-2 py-1 rounded-full", 
                          userStats.stats.positionChange > 0 ? 'text-green-400 bg-green-500/20' : 
                          userStats.stats.positionChange < 0 ? 'text-red-400 bg-red-500/20' : 'text-muted-foreground bg-gray-500/20'
                        )}>
                          {userStats.stats.positionChange > 0 && <ArrowUp className="h-3 w-3" />}
                          {userStats.stats.positionChange < 0 && <ArrowDown className="h-3 w-3" />}
                          <span className="font-bold">{Math.abs(userStats.stats.positionChange)}</span>
                        </div>
                      </div>
                      <div className="absolute -bottom-1 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
                    </CardContent>
                  </Card>

                  {/* Total Points Card */}
                  <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 hover:border-green-400/40">
                    <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-500 opacity-5" />
                    
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        💰 Total Points
                      </CardTitle>
                      <div className="p-2 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 bg-opacity-10">
                        <Coins className="h-5 w-5 text-green-400" />
                      </div>
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="text-3xl font-bold font-headline text-green-400">
                        {userStats.user.totalPoints.toLocaleString()}
                      </div>
                      <div className="absolute -bottom-1 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-green-400/60 to-transparent" />
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            
            {/* Main Content with Tabs - Modernizado */}
            <div className="lg:col-span-2">
                <Tabs defaultValue="history" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-1">
                        <TabsTrigger 
                          value="history" 
                          className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
                        >
                          📊 Points History
                        </TabsTrigger>
                        <TabsTrigger 
                          value="leaderboard"
                          className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
                        >
                          🏆 Global Ranking
                        </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="history" className="mt-6">
                        <Card className="border-2 border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-green-500/10">
                            <CardHeader className="bg-gradient-to-r from-green-500/5 to-emerald-500/5">
                                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                                  📈 Points History
                                </CardTitle>
                                <CardDescription>Track the points you have earned and spent.</CardDescription>
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
                    </TabsContent>
                    
                    <TabsContent value="leaderboard" className="mt-6">
                        <Card className="border-2 border-blue-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-blue-500/10">
                            <CardHeader className="bg-gradient-to-r from-blue-500/5 to-cyan-500/5">
                                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                    <div>
                                        <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                                          🏆 Global Ranking
                                        </CardTitle>
                                        <CardDescription>Top players by total points</CardDescription>
                                    </div>
                                    <div className="relative w-full md:max-w-xs">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-400" />
                                        <Input
                                            placeholder="🔍 Search player..."
                                            className="pl-12 py-3 rounded-xl border-2 border-blue-500/20 bg-card/50 backdrop-blur-sm focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-all duration-300"
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
                                            {playersToDisplay.length === 0 && !isLoadingPlayers ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                                        {searchTerm ? 'No players found matching your search.' : 'No players found.'}
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                playersToDisplay.map((player) => (
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
                                                ))
                                            )}
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
                    </TabsContent>
                </Tabs>
            </div>
            
            {/* Sidebar modernizado */}
            <div className="grid auto-rows-max items-start gap-6 lg:gap-8">
                {/* Daily Drop Card */}
                <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 hover:border-green-400/40">
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-orange-500 opacity-5" />
                    
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          🎁 Daily Drop
                        </CardTitle>
                        <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 bg-opacity-10">
                            <Gift className="h-5 w-5 text-yellow-500" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {getDailyDropDescription()}
                        </p>
                        <Button 
                          onClick={handleClaim} 
                          disabled={buttonState.disabled} 
                          className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-yellow-500/30 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-yellow-500/40 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {buttonState.icon && <buttonState.icon className="mr-2 h-4 w-4" />}
                            {buttonState.text}
                        </Button>
                        <div className="absolute -bottom-1 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />
                    </CardContent>
                </Card>
                
                {/* HyppieLiquid Stats Card */}
                <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 hover:border-green-400/40">
                    <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-500 opacity-5" />
                    
                    <CardHeader className="text-center pb-3">
                        <div className="flex items-center justify-center mb-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 bg-opacity-10">
                                <Star className="h-6 w-6 text-green-400" />
                            </div>
                        </div>
                        <CardTitle className="text-lg font-bold text-foreground">
                          ✨ HyppieLiquid
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <div>
                            <div className="text-3xl font-bold text-green-400 font-headline">
                                {userStats ? userStats.user.totalPoints.toLocaleString() : (isLoadingUserStats ? '---' : '0')}
                            </div>
                            <div className="text-sm text-muted-foreground">Total Points</div>
                        </div>
                        
                        {userStats && (
                            <div className="space-y-2 pt-2 border-t border-green-500/20">
                                <div className="text-xs text-muted-foreground">
                                    🏆 Rank #{userStats.stats.ranking}
                                </div>
                                <div className={cn("text-sm font-medium px-3 py-1 rounded-full", userStats.stats.tierColor)}>
                                    {userStats.stats.tier} Tier
                                </div>
                            </div>
                        )}
                        
                        <div className="absolute -bottom-1 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-green-400/60 to-transparent" />
                    </CardContent>
                </Card>
            </div>
        </div>
      </div>
      {isLocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-start pt-24 text-center bg-background/80 backdrop-blur-sm rounded-lg p-4">
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
            ) : !isStarterQuestCompleted ? (
                <>
                    <p className="mt-4 text-lg font-semibold">Complete Starter Quest First</p>
                    <p className="mt-1 text-sm text-muted-foreground">You need to complete the "Get Started" quest to unlock the Points section.</p>
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
