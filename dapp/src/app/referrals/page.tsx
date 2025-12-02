'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Users, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Pie, PieChart } from "recharts"
import type { ChartConfig } from "@/components/ui/chart"
import {
  ChartContainer,
} from "@/components/ui/chart";
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import Link from 'next/link';
import CountdownTimer from '@/components/shared/countdown-timer';

interface ReferralData {
  username: string | null;
  referralLink: string | null;
  totalReferrals: number;
  referralRewards: number;
  referrals: Array<{
    id: string;
    username: string;
    image: string | null;
    joinedAt: string;
    xp: number;
  }>;
  referredBy: {
    id: string;
    username: string;
    image: string | null;
  } | null;
}


const chartConfig = {
  value: {
    label: "XP",
  },
  direct: {
    label: "Direct XP",
    color: "hsl(var(--chart-1))",
  },
  referral: {
    label: "Referral XP",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;


function ReferralsView() {
  const { toast } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);

  const unlockDate = useMemo(() => new Date("2024-01-01T00:00:00"), []);
  const [isTimeLocked, setIsTimeLocked] = useState(new Date() < unlockDate);

  useEffect(() => {
    setIsClient(true);
    const timer = setInterval(() => {
      if (new Date() >= unlockDate) {
        setIsTimeLocked(false);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [unlockDate]);

  useEffect(() => {
    if (user && !isTimeLocked) {
      fetchReferralData();
    }
  }, [user, isTimeLocked]);

  const fetchReferralData = async () => {
    if (!user?.walletAddress) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/referrals?walletAddress=${user.walletAddress}`);
      if (response.ok) {
        const data = await response.json();
        setReferralData(data);
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setIsLoading(false);
    }
  };


  const isStarterQuestCompleted = useMemo(() => {
    if (!user) return false;
    return user.completedQuests.some(cq => cq.quest.isStarter);
  }, [user]);

  const isWalletConnected = !!user;
  const isLocked = isTimeLocked || !isWalletConnected || !isStarterQuestCompleted;
  
  console.log('Lock status:', {
    isTimeLocked,
    isWalletConnected,
    isStarterQuestCompleted,
    isLocked
  });

  const copyToClipboard = () => {
    if (user?.username) {
      const referralLink = `${window.location.origin}/r/${user.username}`;
      navigator.clipboard.writeText(referralLink);
      toast({
        title: "Copied to clipboard!",
        description: "You can now share your referral link.",
      });
    }
    setActiveIndex(null);
  };

  const directXP = user?.xp || 0;
  const referralXP = referralData?.referralRewards || 0;
  const totalXP = directXP + referralXP;

  const chartData = [
    { name: "Direct XP", value: directXP, fill: "var(--color-direct)" },
    { name: "Referral XP", value: referralXP, fill: "var(--color-referral)" },
  ];

  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index);
  }, [setActiveIndex]);

  const onPieLeave = useCallback(() => {
    setActiveIndex(null);
  }, [setActiveIndex]);

  if (isAuthLoading || isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative max-w-4xl mx-auto">
        <div className={cn("flex flex-col gap-8", isLocked && 'blur-sm pointer-events-none')}>
          <div className="text-center">
              <h1 className="text-3xl font-bold font-headline">Referrals</h1>
              <p className="text-muted-foreground mt-2">
              Invite friends to Cukies World and earn rewards when they play.
              </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="md:col-span-2">
                  <CardHeader>
                      <CardTitle>Your Referral Link</CardTitle>
                      <CardDescription>Share this link with your friends to earn rewards.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      {user?.username && isClient ? (
                        <div className="flex items-center space-x-2">
                            <Input value={`${window.location.origin}/r/${user.username}`} readOnly />
                            <Button variant="outline" size="icon" onClick={copyToClipboard}>
                                <Copy className="h-4 w-4" />
                                <span className="sr-only">Copy link</span>
                            </Button>
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">
                            <p>Set your username in your profile to get your referral link</p>
                        </div>
                      )}
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader className="items-center text-center pb-2">
                      <CardTitle className="text-base font-medium">Total Referrals</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center p-6 pt-0">
                      <Users className="h-10 w-10 text-muted-foreground mb-2" />
                      <span className="text-5xl font-bold text-primary">{referralData?.totalReferrals || 0}</span>
                  </CardContent>
              </Card>
          </div>

          <Card>
              <CardHeader>
                  <CardTitle>Points Breakdown</CardTitle>
                  <CardDescription>Direct vs. Referral XP</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-8 md:grid-cols-2 md:items-center">
                  <div className="relative">
                      <ChartContainer
                          config={chartConfig}
                          className="mx-auto aspect-square h-[250px]"
                      >
                          <PieChart>
                              <Pie
                                  data={chartData}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius={60}
                                  strokeWidth={5}
                                  onMouseEnter={onPieEnter}
                                  onMouseLeave={onPieLeave}
                              />
                          </PieChart>
                      </ChartContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" aria-hidden="true">
                          <span className="text-3xl font-bold font-mono">
                              {isClient && totalXP.toLocaleString()}
                          </span>
                          <span className="text-sm text-muted-foreground">Total XP</span>
                      </div>
                  </div>
                  <div className="flex flex-col gap-4 text-sm">
                      {chartData.map((entry, index) => (
                          <div
                              key={entry.name}
                              className={cn(
                                  "flex items-center gap-2 p-2 rounded-lg transition-colors",
                                  activeIndex === index && "bg-muted"
                              )}
                          >
                              <div
                                  className="h-3 w-3 shrink-0 rounded-full"
                                  style={{ backgroundColor: entry.fill }}
                              />
                              <div className="flex flex-1 justify-between">
                                  <span className="text-muted-foreground">{entry.name}</span>
                                  <span className="font-medium text-foreground">
                                    {isClient && entry.value.toLocaleString()}
                                  </span>
                              </div>
                          </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total</span>
                        <span>{isClient && totalXP.toLocaleString()}</span>
                      </div>
                  </div>
              </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Referrals</CardTitle>
              <CardDescription>
                You've referred {referralData?.totalReferrals || 0} friends. Keep it up!
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {referralData?.referrals && referralData.referrals.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Points Earned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referralData.referrals.map((referral) => (
                      <TableRow key={referral.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={referral.image || ''} />
                              <AvatarFallback>{referral.username.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{referral.username}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(referral.joinedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          {isClient && `${referral.xp.toLocaleString('en-US')} XP`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No referrals yet. Share your link to get started!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {isLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-start pt-24 text-center bg-card/60 backdrop-blur-xs rounded-lg p-4">
                <Lock className="h-8 w-8 text-muted-foreground" />
                {isTimeLocked ? (
                    <>
                        <p className="mt-4 text-lg font-semibold">Referrals are Locked</p>
                        <p className="mt-1 text-sm text-muted-foreground">This feature will be available soon. Check back later!</p>
                        <CountdownTimer targetDate={unlockDate.toISOString()} />
                    </>
                ) : !isWalletConnected ? (
                    <>
                        <p className="mt-4 text-lg font-semibold">Connect Your Wallet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Please connect your wallet to view your referrals.</p>
                    </>
                ) : !isStarterQuestCompleted ? (
                    <>
                        <p className="mt-4 text-lg font-semibold">Feature Locked</p>
                        <p className="mt-1 text-sm text-muted-foreground">Complete the "Get Started" quest to unlock referrals.</p>
                        <Button asChild className="mt-4">
                            <Link href="/quests">Complete Quest</Link>
                        </Button>
                    </>
                ) : null}
            </div>
        )}

      </div>
  );
}

export default function ReferralsPage() {
  return (
    <AppLayout>
      <ReferralsView />
    </AppLayout>
  )
}
