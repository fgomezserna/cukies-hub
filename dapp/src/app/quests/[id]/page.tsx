'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Loader2, CheckSquare, Square } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import toast from 'react-hot-toast';

const SET_USERNAME_TASK_API_ID = '/api/tasks/validate/username';

type Task = {
  id: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  validationApiEndpoint: string | null;
};

type QuestDetails = {
  id: string;
  title: string;
  description: string | null;
  xp: number;
  tasks: Task[];
  isClaimed: boolean;
  isLocked: boolean;
};

export default function QuestDetailPage() {
  const params = useParams();
  const questId = params.id as string;
  const { user, fetchUser } = useAuth();
  const [quest, setQuest] = useState<QuestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const router = useRouter();

  const fetchQuestDetails = useCallback(async () => {
    if (!questId) return;
    setIsLoading(true);
    const url = user
      ? `/api/quests/${questId}?walletAddress=${user.walletAddress}`
      : `/api/quests/${questId}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch quest details');
      const data = await response.json();
      setQuest(data);
    } catch (error) {
      console.error(error);
      toast.error('Could not load quest details.');
    } finally {
      setIsLoading(false);
    }
  }, [questId, user]);

  useEffect(() => {
    fetchQuestDetails();
  }, [fetchQuestDetails]);

  const handleClaimReward = async () => {
    if (!user || !quest) return;
    setIsClaiming(true);
    const toastId = toast.loading('Claiming your reward...');

    try {
      const response = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user.walletAddress, questId: quest.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to claim reward');

      toast.success(`🎉 You claimed ${data.xpGained} XP!`, { id: toastId });
      fetchQuestDetails(); // Refetch quest details to update UI state
      fetchUser(); // Refetch user to update total XP in header
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsClaiming(false);
    }
  };

  const handleVerifyClick = (task: Task) => {
    toast.error(`Verification for "${task.title}" is not implemented yet.`);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!quest) {
    return <div className="text-center">Quest not found.</div>;
  }

  if (quest.isLocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h1 className="text-2xl font-bold mb-4">Quest Locked</h1>
        <p className="mb-6 text-muted-foreground">
          You must complete the starter quest before accessing this one.
        </p>
        <Button onClick={() => router.push('/quests')}>Back to Quests</Button>
      </div>
    );
  }

  const completedTasks = quest.tasks.filter(t => t.isCompleted).length;
  const totalTasks = quest.tasks.length;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const allTasksCompleted = completedTasks === totalTasks;

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{quest.title}</CardTitle>
          <CardDescription>{quest.description}</CardDescription>
          <div className="flex items-center pt-4">
            <p className="text-lg font-bold text-primary mr-4">{quest.xp} XP</p>
            <Progress value={progress} className="w-full" />
          </div>
        </CardHeader>
        <CardContent>
          <h3 className="text-xl font-semibold mb-4">Tasks</h3>
          <div className="space-y-4">
            {quest.tasks.map((task) => {
              const isUsernameTask = task.validationApiEndpoint === SET_USERNAME_TASK_API_ID;
              return (
                <div key={task.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center">
                    {task.isCompleted ? <CheckSquare className="h-6 w-6 text-green-500" /> : <Square className="h-6 w-6 text-muted-foreground" />}
                    <div className="ml-4">
                      <p className="font-medium">{task.title}</p>
                      {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                    </div>
                  </div>
                  {isUsernameTask ? (
                    <Button asChild variant="outline" size="sm" disabled={task.isCompleted}>
                      <Link href="/settings">{task.isCompleted ? 'Done' : 'Go to Settings'}</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={task.isCompleted} onClick={() => handleVerifyClick(task)}>
                      {task.isCompleted ? 'Done' : 'Verify'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-8">
            <Button 
              className="w-full" 
              size="lg" 
              disabled={!allTasksCompleted || isClaiming || quest.isClaimed}
              onClick={handleClaimReward}
            >
              {isClaiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {quest.isClaimed ? 'Reward Claimed' : 'Claim Reward'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 