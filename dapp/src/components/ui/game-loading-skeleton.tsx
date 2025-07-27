'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import AppLayout from '@/components/layout/app-layout';

interface GameLoadingSkeletonProps {
  message?: string;
}

export default function GameLoadingSkeleton({ message = "Loading game..." }: GameLoadingSkeletonProps) {
  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
        
        {/* Left Column: Game Loading Area */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* Game Container */}
          <div className="bg-card flex-grow flex flex-col relative overflow-hidden rounded-lg border">
            <div className="w-full h-full min-h-[480px] lg:min-h-0 flex items-center justify-center bg-muted/10">
              <div className="text-center space-y-6">
                {/* Animated Game Icon */}
                <div className="relative mx-auto w-20 h-20">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
                  <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30">
                    <div className="text-3xl animate-bounce">🎮</div>
                  </div>
                </div>
                
                {/* Loading Text */}
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">{message}</h3>
                  <p className="text-sm text-muted-foreground">Preparing your gaming experience...</p>
                </div>
                
                {/* Loading Dots */}
                <div className="flex justify-center space-x-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Game Instructions Skeleton */}
          <Card>
            <CardContent className="p-4 flex justify-around items-center">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Game Info Skeletons */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          
          {/* Game Title Skeleton */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-6 w-32" />
              </div>
              <Skeleton className="h-4 w-full mt-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
          </Card>

          {/* User High Score Skeleton */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
          
          {/* User Rank Skeleton */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-20" />
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Leaderboard Skeleton */}
          <Card className="flex-grow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-3 w-32" />
            </CardHeader>
            <CardContent className="p-3">
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-3 w-4" />
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chat Button Skeleton */}
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </AppLayout>
  );
}