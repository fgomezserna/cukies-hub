'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Circle, Coins, Gamepad2, Lock, Mail, Star, User, Loader2 } from 'lucide-react';
import DiscordIcon from '@/components/icons/discord';
import XIcon from '@/components/icons/x-icon';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Quest, Task } from '@prisma/client';

type QuestWithDetails = Quest & {
  tasks: Task[];
  isCompleted: boolean;
  completedTasksCount: number;
  isLocked: boolean;
};

const TaskItem = ({ text, completed, onVerify, disabled }: { text: string; completed: boolean; onVerify: () => void; disabled: boolean; }) => (
  <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
    {completed ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
    <span className={completed ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
    <Button size="sm" variant="ghost" className="ml-auto" disabled={completed || disabled} onClick={onVerify}>
      {completed ? 'Verified' : 'Verify'}
    </Button>
  </div>
);

function UsernameTask({ task, onVerify, disabled }: { task: { id: string; text: string; completed: boolean }; onVerify: (taskId: string, username: string) => void, disabled: boolean }) {
  const [username, setUsername] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onVerify(task.id, username);
      setIsEditing(false);
    }
  };

  if (task.completed) {
    return (
      <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <span className="text-foreground">{task.text}</span>
        <Button size="sm" variant="ghost" className="ml-auto" disabled>
          Verified
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 rounded-md bg-muted/50 border border-transparent has-[input:focus]:border-primary/50 transition-colors">
        <div className="flex items-center gap-3">
            <Circle className="h-5 w-5 text-muted-foreground" />
            <span className='flex-grow text-muted-foreground'>{task.text}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setIsEditing(!isEditing)} disabled={disabled}>
                {isEditing ? 'Cancel' : 'Set Username'}
            </Button>
        </div>
        {isEditing && (
            <form className="flex w-full space-x-2 pl-8" onSubmit={handleSubmit}>
                <Input
                    placeholder="Enter your unique username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="flex-1 h-9"
                    autoFocus
                />
                <Button type="submit" size="sm" disabled={!username.trim()}>
                    Save
                </Button>
            </form>
        )}
    </div>
  );
}

function ConnectAccountTask({ text, completed, onVerify, disabled }: { text: string; completed: boolean; onVerify: () => void; disabled: boolean; }) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    // In a real app, this would trigger an OAuth flow.
    // We simulate it with a delay.
    setTimeout(() => {
      onVerify();
      setIsConnecting(false);
    }, 1500);
  };

  return (
    <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
      {completed ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
      <span className={completed ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
      <Button size="sm" variant="ghost" className="ml-auto w-28 justify-center" disabled={completed || isConnecting || disabled} onClick={handleConnect}>
        {isConnecting ? (
            <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting
            </>
        ) : completed ? (
            'Connected'
        ) : (
            'Connect'
        )}
      </Button>
    </div>
  );
}

function QuestsView() {
  const { user, isLoading: isAuthLoading, fetchUser } = useAuth();
  const { toast } = useToast();
  const [quests, setQuests] = useState<QuestWithDetails[]>([]);
  const [isLoadingQuests, setIsLoadingQuests] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const fetchQuests = useCallback(async () => {
    if (!user) {
      setIsLoadingQuests(false);
      return;
    };
    try {
      setIsLoadingQuests(true);
      const response = await fetch(`/api/quests?walletAddress=${user.walletAddress}`);
      if (!response.ok) throw new Error('Failed to fetch quests');
      const data = await response.json();
      setQuests(data);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Could not load quests.', variant: 'destructive' });
    } finally {
      setIsLoadingQuests(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  const starterQuest = useMemo(() => quests.find(q => q.isStarter), [quests]);
  
  const completedQuestsCount = useMemo(() => quests.filter(q => q.isCompleted).length, [quests]);

  const completedStarterTasks = useMemo(() => starterQuest?.tasks.filter(t => (t as any).isCompleted).length ?? 0, [starterQuest]);
  const totalStarterTasks = useMemo(() => starterQuest?.tasks.length ?? 0, [starterQuest]);
  const isStarterTasksComplete = useMemo(() => completedStarterTasks === totalStarterTasks, [completedStarterTasks, totalStarterTasks]);
  const starterProgress = useMemo(() => totalStarterTasks > 0 ? (completedStarterTasks / totalStarterTasks) * 100 : 0, [completedStarterTasks, totalStarterTasks]);

  const handleVerifyTask = async (questId: string, taskId: string, payload?: any) => {
    try {
      // In a real app, you would have a specific endpoint per task type
      const response = await fetch(`/api/quests/tasks/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user?.walletAddress, taskId, ...payload }),
      });
      if (!response.ok) throw new Error('Verification failed');
      
      const updatedQuest = await response.json();

      setQuests(prev => prev.map(q => q.id === questId ? updatedQuest : q));

      toast({
        title: `Task Verified!`,
        description: `Progress updated.`,
      });
    } catch (error: any) {
        toast({ title: 'Error', description: error.message || 'Could not verify task.', variant: 'destructive' });
    }
  };
  
  const handleClaimReward = async (questId: string) => {
    if (!user) return;
    try {
      const response = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user.walletAddress, questId }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || 'Failed to claim reward');
      }

      const { xpGained } = await response.json();
      
      toast({
        title: 'Quest Completed!',
        description: `You've earned ${xpGained} XP.`,
      });
      
      fetchQuests(); // Re-fetch all quests to update state
      fetchUser(); // Re-fetch user to update XP
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const displayedQuests = useMemo(() => {
    const isStarterQuestCompleted = starterQuest?.isCompleted;
    const questList = quests.filter(q => !q.isStarter || (q.isStarter && isStarterQuestCompleted));
    
    if (activeTab === 'all') {
      return questList;
    }
    return questList.filter(q => q.isCompleted === (activeTab === 'completed'));
  }, [quests, activeTab, starterQuest?.isCompleted]);
  
  const isAnythingLocked = !user || (starterQuest && !starterQuest.isCompleted);

  if (isAuthLoading || isLoadingQuests) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-4 text-center">
        <p className="text-lg font-semibold">Wallet Not Connected</p>
        <p className="text-muted-foreground">Please connect your wallet to view and complete quests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {starterQuest && !starterQuest.isCompleted && (
        <Card className="bg-card/80 border-primary/50 border-2">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                        <Star className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <CardTitle>{starterQuest.title}</CardTitle>
                        <CardDescription>{starterQuest.description}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {starterQuest.tasks.map((task: any) => {
                    if (task.id.includes('username')) {
                        return <UsernameTask key={task.id} task={task} disabled={starterQuest.isLocked} onVerify={(taskId, username) => handleVerifyTask(starterQuest.id, taskId, { username })} />
                    }
                    if (task.id.includes('connect') || task.id.includes('join') || task.id.includes('follow')) {
                        return <ConnectAccountTask key={task.id} text={task.title} completed={task.isCompleted} disabled={starterQuest.isLocked} onVerify={() => handleVerifyTask(starterQuest.id, task.id)} />
                    }
                    return <TaskItem key={task.id} text={task.title} completed={task.isCompleted} disabled={starterQuest.isLocked} onVerify={() => handleVerifyTask(starterQuest.id, task.id)} />
                })}
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-3">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span>{completedStarterTasks}/{totalStarterTasks}</span>
                </div>
                <Progress value={starterProgress} />
                <Button onClick={() => handleClaimReward(starterQuest.id)} disabled={!isStarterTasksComplete || starterQuest.isCompleted}>
                    {starterQuest.isCompleted ? 'Reward Claimed' : `Claim ${starterQuest.xp} XP`}
                </Button>
            </CardFooter>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Quests</CardTitle>
              <CardDescription>Complete quests to earn XP and climb the leaderboard.</CardDescription>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="incomplete">Active</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className={isAnythingLocked ? 'blur-sm pointer-events-none' : ''}>
              <Accordion type="single" collapsible className="w-full">
                {displayedQuests.map((quest) => (
                  <AccordionItem value={quest.id} key={quest.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-4 w-full">
                        <div className="p-2 rounded-lg bg-muted">
                          <Coins className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="flex-grow text-left">
                          <p className="font-semibold">{quest.title}</p>
                          <p className="text-sm text-muted-foreground">{quest.description}</p>
                        </div>
                        <div className="flex items-center gap-4 pr-4">
                          <Badge variant="outline" className="text-primary border-primary">{quest.xp} XP</Badge>
                          {quest.isCompleted ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {quest.tasks.map((task: any) => (
                        <TaskItem key={task.id} text={task.title} completed={task.isCompleted} onVerify={() => handleVerifyTask(quest.id, task.id)} disabled={quest.isLocked || quest.isCompleted} />
                      ))}
                      <Button onClick={() => handleClaimReward(quest.id)} disabled={!quest.isCompleted || quest.isCompleted}>
                        Claim Reward
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
            {isAnythingLocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-xs rounded-lg p-4 text-center">
                <Lock className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  Complete the "Get Started" quest to unlock
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function QuestsPage() {
  return (
    <AppLayout>
      <QuestsView />
    </AppLayout>
  )
}
