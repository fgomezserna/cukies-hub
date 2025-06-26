'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { ClientLink } from '@/components/client-link';

// Define the Quest type for the frontend to match the API response
type Task = {
  id: string;
  title: string;
  description: string | null;
};

type Quest = {
  id: string;
  title: string;
  description: string | null;
  xp: number;
  tasks: Task[];
  isCompleted: boolean;
  completedTasksCount: number;
  isLocked: boolean;
};

export default function QuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchQuests() {
      setIsLoading(true);
      // Append wallet address to get user-specific quest completion status
      const url = user ? `/api/quests?walletAddress=${user.walletAddress}` : '/api/quests';
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch quests');
        }
        const data = await response.json();
        setQuests(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchQuests();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading Quests...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Quests</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quests.map((quest) => {
          const totalTasks = quest.tasks.length;
          const completedTasks = quest.completedTasksCount || 0;
          const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
          const isLocked = quest.isLocked;

          const cardContent = (
            <Card className={`flex flex-col h-full transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary cursor-pointer'}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle>{quest.title}</CardTitle>
                  <Badge variant={isLocked ? 'destructive' : quest.isCompleted ? 'default' : 'secondary'}>
                    {isLocked ? 'Locked' : quest.isCompleted ? 'Completed' : 'Available'}
                  </Badge>
                </div>
                <CardDescription>{quest.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground mt-2">
                  {completedTasks} / {totalTasks} tasks completed
                </p>
              </CardContent>
              <CardFooter>
                <p className="text-sm font-bold text-primary">{quest.xp} XP</p>
              </CardFooter>
            </Card>
          );

          return isLocked ? (
            <div key={quest.id}>{cardContent}</div>
          ) : (
            <ClientLink href={`/quests/${quest.id}`} key={quest.id}>
              {cardContent}
            </ClientLink>
          );
        })}
      </div>
    </div>
  );
} 