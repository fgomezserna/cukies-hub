'use client';

import React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { Crown, ShieldCheck } from 'lucide-react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const players = [
  { rank: 1, name: "SybilSlayerPro", rankChange: 2, score: 152340, avatar: "https://placehold.co/40x40.png", hint: "pro gamer" },
  { rank: 2, name: "GemHunter", rankChange: -1, score: 148970, avatar: "https://placehold.co/40x40.png", hint: "gem stone" },
  { rank: 3, name: "You", rankChange: 0, score: 135600, avatar: "https://placehold.co/40x40.png", hint: "profile avatar" },
  { rank: 4, name: "TokenRunner", rankChange: 5, score: 121000, avatar: "https://placehold.co/40x40.png", hint: "running shoe" },
  { rank: 5, name: "ChainMaster", rankChange: -2, score: 115750, avatar: "https://placehold.co/40x40.png", hint: "master crown" },
  { rank: 6, name: "PixelPioneer", rankChange: 3, score: 102300, avatar: "https://placehold.co/40x40.png", hint: "pixel art" },
];

function LeaderboardView() {
  const { user } = useAuth();
  
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Leaderboard</h1>
        <p className="text-muted-foreground">See who's on top of the game.</p>
      </div>
      <Card>
        <CardHeader className="flex-col items-start gap-4 border-b md:flex-row md:items-center md:justify-between">
          <Tabs defaultValue="all-time" className="w-full md:w-auto">
            <TabsList className="grid w-full grid-cols-4 md:w-auto">
              <TabsTrigger value="all-time">All Time</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex w-full items-center gap-2 md:w-auto">
              <Select defaultValue="sybil-slayer">
                  <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Select a game" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="sybil-slayer">Sybil Slayer</SelectItem>
                  </SelectContent>
              </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px] text-center">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="w-[150px] text-center">Rank Change</TableHead>
                <TableHead className="text-right">Best Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => (
                <TableRow key={player.rank} className={player.name === 'You' ? 'bg-primary/10 hover:bg-primary/20' : ''}>
                  <TableCell className="font-medium text-lg text-center">{player.rank}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={player.avatar} data-ai-hint={player.hint} />
                        <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className='flex items-center gap-2'>
                         {user ? (
                          <Link href={`/profile/${player.name}`} className="font-medium hover:underline">
                            {player.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{player.name}</span>
                        )}
                        {player.rank <= 3 && <Badge variant="secondary" className="bg-transparent">{player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}</Badge>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={`flex items-center justify-center gap-1 font-medium ${
                      player.rankChange > 0 ? 'text-primary' : player.rankChange < 0 ? 'text-destructive' : 'text-muted-foreground'
                    }`}>
                      {player.rankChange > 0 && <ArrowUp className="h-4 w-4" />}
                      {player.rankChange < 0 && <ArrowDown className="h-4 w-4" />}
                      {player.rankChange === 0 && <Minus className="h-4 w-4" />}
                      <span>{Math.abs(player.rankChange)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-primary">{player.score.toLocaleString('en-US')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  
  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Leaderboard</h1>
          <p className="text-muted-foreground">See who's on top of the game.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Top Players</CardTitle>
            <CardDescription>
              The best of the best. Can you beat them? 
              {!user && <span className="text-primary font-semibold"> Connect your wallet to see your rank.</span>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px] text-center">Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Best Score</TableHead>
                  <TableHead className="text-right">Matches Played</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player, index) => (
                  <TableRow key={player.rank} className={user && user.username === player.name ? 'bg-primary/10' : ''}>
                    <TableCell className="font-medium text-center">{player.rank}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={player.avatar} alt="Avatar" />
                          <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="ml-4 space-y-1">
                          <p className="text-sm font-medium leading-none">
                            <Link href={`/profile/${player.name}`} className="hover:underline">
                              {player.name}
                            </Link>
                            {player.rank === 1 && <Crown className="inline-block ml-2 h-4 w-4 text-yellow-400" />}
                            {player.verified && <ShieldCheck className="inline-block ml-2 h-4 w-4 text-blue-500" />}
                          </p>
                          <p className="text-sm text-muted-foreground">{player.hint}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{player.score.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{player.rankChange.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={player.rankChange > 0 ? 'default' : 'secondary'} className={player.rankChange > 0 ? 'bg-green-600/20 text-green-400 border-green-600/30' : ''}>
                        {player.rankChange > 0 ? 'Up' : 'Down'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}