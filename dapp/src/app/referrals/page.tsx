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

const referralsData = [
  { name: "CryptoKing", joined: "2024-07-25", points: 15000, avatar: "https://placehold.co/40x40.png", hint: "king crown" },
  { name: "DiamondHands", joined: "2024-07-22", points: 12500, avatar: "https://placehold.co/40x40.png", hint: "diamond hands" },
  { name: "PixelPioneer", joined: "2024-07-20", points: 10000, avatar: "https://placehold.co/40x40.png", hint: "pixel art" },
  { name: "ChainMaster", joined: "2024-07-18", points: 8000, avatar: "https://placehold.co/40x40.png", hint: "master crown" },
  { name: "TokenRunner", joined: "2024-07-15", points: 4000, avatar: "https://placehold.co/40x40.png", hint: "running shoe" },
];

const directPoints = 1250;
const totalReferralPoints = referralsData.reduce((acc, referral) => acc + referral.points, 0);
const totalPoints = directPoints + totalReferralPoints;

const chartData = [
  { name: "Direct XP", value: directPoints, fill: "var(--color-direct)" },
  { name: "Referral XP", value: totalReferralPoints, fill: "var(--color-referral)" },
];

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
  
  const referralLink = user?.referralCode ? `https://hyppieliquid.com/r/${user.referralCode}` : "https://hyppieliquid.com/r/your-code-123";

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isStarterQuestCompleted = useMemo(() => {
    if (!user || !user.completedQuests) return false;
    return user.completedQuests.some(cq => cq.quest.isStarter);
  }, [user]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    toast({
      title: "Copied to clipboard!",
      description: "You can now share your referral link.",
    });
    setActiveIndex(null);
  };

  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index);
  }, [setActiveIndex]);

  const onPieLeave = useCallback(() => {
    setActiveIndex(null);
  }, [setActiveIndex]);

  const isLocked = !user || !isStarterQuestCompleted;

  if (isAuthLoading) {
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
              Invite friends to HyppieLiquid and earn rewards when they play.
              </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="md:col-span-2">
                  <CardHeader>
                      <CardTitle>Your Referral Link</CardTitle>
                      <CardDescription>Share this link with your friends to earn rewards.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <div className="flex items-center space-x-2">
                          <Input value={referralLink} readOnly />
                          <Button variant="outline" size="icon" onClick={copyToClipboard}>
                              <Copy className="h-4 w-4" />
                              <span className="sr-only">Copy link</span>
                          </Button>
                      </div>
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader className="items-center text-center pb-2">
                      <CardTitle className="text-base font-medium">Total Referrals</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center p-6 pt-0">
                      <Users className="h-10 w-10 text-muted-foreground mb-2" />
                      <span className="text-5xl font-bold text-primary">{referralsData.length}</span>
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
                              {isClient && totalPoints.toLocaleString()}
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
                        <span>{isClient && totalPoints.toLocaleString()}</span>
                      </div>
                  </div>
              </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Referrals</CardTitle>
              <CardDescription>
                You've referred {referralsData.length} friends. Keep it up!
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Points Earned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referralsData.map((referral) => (
                    <TableRow key={referral.name}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={referral.avatar} data-ai-hint={referral.hint} />
                            <AvatarFallback>{referral.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{referral.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{referral.joined}</TableCell>
                      <TableCell className="text-right font-medium text-primary">{isClient && `${referral.points.toLocaleString('en-US')} XP`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {isLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-xs rounded-lg p-4 text-center">
                <Lock className="h-8 w-8 text-muted-foreground" />
                <p className="mt-4 text-lg font-semibold">
                  {
                    !user
                      ? 'Connect your wallet'
                      : 'Feature Locked'
                  }
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {
                    !user
                      ? 'Please connect your wallet to view your referrals.'
                      : 'Complete the "Get Started" quest to unlock referrals.'
                  }
                </p>
                {user && !isStarterQuestCompleted && (
                  <Button asChild className="mt-4">
                    <Link href="/quests">Complete Quest</Link>
                  </Button>
                )}
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
