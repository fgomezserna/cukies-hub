'use client';

import { useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { isToday } from 'date-fns';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export function DailyCheckin() {
  const { user, fetchUser } = useAuth();
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  if (!user) {
    return null; // Don't show anything if user is not logged in
  }

  const handleCheckin = async () => {
    setIsCheckingIn(true);
    const toastId = toast.loading('Processing your check-in...');
    
    try {
      const response = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user.walletAddress }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Check-in failed');
      }

      toast.success(`You earned ${data.xpGained} XP! Your new streak is ${data.currentStreak} days.`, { id: toastId });
      fetchUser(); // Refetch user data to update the UI
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsCheckingIn(false);
    }
  };

  const lastCheckInDate = user.lastCheckIn ? new Date(user.lastCheckIn.lastCheckIn) : null;
  const alreadyCheckedIn = lastCheckInDate ? isToday(lastCheckInDate) : false;
  const streak = user.lastCheckIn?.days ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Check-in</CardTitle>
        <CardDescription>Claim your daily XP and keep your streak going!</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="text-center">
            <p className="text-5xl font-bold">{streak}</p>
            <p className="text-sm text-muted-foreground">Day Streak</p>
        </div>
        <Button onClick={handleCheckin} disabled={alreadyCheckedIn || isCheckingIn} className="w-full">
          {isCheckingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {alreadyCheckedIn ? 'Come back tomorrow!' : 'Claim XP'}
        </Button>
      </CardContent>
    </Card>
  );
} 