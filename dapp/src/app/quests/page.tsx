'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, CheckCircle2, Award } from 'lucide-react';
import { ClientLink } from '@/components/client-link';
import { cn } from '@/lib/utils';

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

function QuestSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-primary from-30% to-primary/60 bg-clip-text text-transparent">
          Quests
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete quests to earn XP and unlock new challenges.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="h-full animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-full mt-2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-2 bg-muted rounded w-full mt-2"></div>
            </CardContent>
            <CardFooter>
              <div className="h-5 bg-muted rounded w-1/4"></div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

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
    return <QuestSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-primary from-30% to-primary/60 bg-clip-text text-transparent">
          Quests
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete quests to earn XP and unlock new challenges.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quests.map((quest) => {
          const totalTasks = quest.tasks.length;
          const completedTasks = quest.completedTasksCount || 0;
          const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
          
          const QuestStatusIcon = quest.isLocked
            ? Lock
            : quest.isCompleted
            ? CheckCircle2
            : Award;
          
          const statusColor = quest.isLocked
            ? "text-destructive"
            : quest.isCompleted
            ? "text-green-500"
            : "text-primary";

          const cardContent = (
            <Card
              className={cn(
                "group flex flex-col h-full transition-all",
                {
                  "bg-muted/30 border-dashed cursor-not-allowed": quest.isLocked,
                  "bg-gradient-to-b from-card to-card/90 backdrop-blur-sm border border-border/50": !quest.isLocked,
                  "hover:border-primary/80 hover:shadow-lg hover:shadow-primary/20": !quest.isLocked && !quest.isCompleted,
                  "border-secondary/60 hover:border-secondary/80 hover:shadow-lg hover:shadow-secondary/20": quest.isCompleted,
                }
              )}
            >
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <CardTitle className="text-lg">{quest.title}</CardTitle>
                  <QuestStatusIcon className={`h-6 w-6 shrink-0 ${statusColor}`} />
                </div>
                <CardDescription className="h-10 mt-1">
                  {quest.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                    {completedTasks} / {totalTasks} tasks completed
                    </p>
                </div>
              </CardContent>
              <CardFooter>
                <p className="text-sm font-bold text-primary">{quest.xp} XP</p>
              </CardFooter>
            </Card>
          );

          return quest.isLocked ? (
            <div key={quest.id}>{cardContent}</div>
          ) : (
            <ClientLink
              href={`/quests/${quest.id}`}
              key={quest.id}
              className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg"
            >
              {cardContent}
            </ClientLink>
          );
        })}
      </div>
    </div>
  );
} 