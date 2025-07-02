'use client';

import React, { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Circle, Coins, Gamepad2, Lock, Mail, Star, User, Loader2, AlertTriangle } from 'lucide-react';
import DiscordIcon from '@/components/icons/discord';
import XIcon from '@/components/icons/x-icon';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { User as UserType, Streak } from '@/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import CountdownTimer from '@/components/shared/countdown-timer';

// Define Quest and Task types matching backend response
type Task = {
  id: string;
  text?: string;
  title?: string; // Backend might use title instead of text
  completed: boolean;
};

type Quest = {
  id: string;
  title: string;
  description: string;
  xp: number;
  isStarter: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  icon: React.ElementType;
  tasks: Task[];
};

const iconMap: { [key: string]: React.ElementType } = {
  'get-started': Star,
  'verifyEmail': Mail,
  'profilePic': User,
  'likeAndRt': XIcon,
  'playGames': Gamepad2,
  'scoreHigh': Gamepad2,
  'followHyppie': XIcon,
};

// Utility function to get task text from either text or title field
const getTaskText = (task: Task): string => {
  return task.text || task.title || '';
};

// Utility function to detect task type based on task text
const getTaskType = (taskText: string | undefined): string => {
  if (!taskText) return 'auto_verify';
  
  const text = taskText.toLowerCase();
  
  if (text.includes('username')) return 'username';
  if (text.includes('email')) return 'email';
  if (text.includes('profile picture')) return 'profilePicture';
  if (text.includes('follow') && (text.includes('twitter') || text.includes(' x '))) return 'twitter_follow';
  if (text.includes('like') || text.includes('retweet')) return 'twitter_like_rt';
  if (text.includes('discord')) return 'discord_join';
  if (text.includes('telegram')) return 'telegram_join';
  if (text.includes('play') || text.includes('game')) return 'game_play';
  if (text.includes('score') || text.includes('points')) return 'game_play';
  
  return 'auto_verify';
};

const TaskItem = ({ text, completed, onVerify, disabled, taskType = 'auto_verify', isLoading = false }: { text: string; completed: boolean; onVerify: (payload: { type: string, value?: any }) => void; disabled: boolean; taskType?: string; isLoading?: boolean; }) => (
  <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
    {completed ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
    <span className={completed ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
    <Button size="sm" variant="ghost" className="ml-auto" disabled={completed || disabled || isLoading} onClick={() => onVerify({ type: taskType })}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Verifying
        </>
      ) : completed ? 'Verified' : 'Verify'}
    </Button>
  </div>
);

function UsernameTask({ task, onVerify, disabled, isLoading = false }: { task: Task; onVerify: (taskId: string, payload: { type: string, value?: any }) => void; disabled: boolean; isLoading?: boolean; }) {
  const [username, setUsername] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  console.log("task", task);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onVerify(task.id, { type: 'username', value: username.trim() });
      setIsEditing(false);
    }
  };

  if (task.completed) {
    return (
      <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <span className="text-foreground">{getTaskText(task)}</span>
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
            <span className='flex-grow text-muted-foreground'>{getTaskText(task)}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setIsEditing(!isEditing)} disabled={disabled || isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting
                  </>
                ) : isEditing ? 'Cancel' : 'Set Username'}
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
                <Button type="submit" size="sm" disabled={!username.trim() || isLoading}>
                    {isLoading ? 'Saving...' : 'Save'}
                </Button>
            </form>
        )}
    </div>
  );
}

function EmailTask({ task, onVerify, disabled, isLoading = false }: { task: Task; onVerify: (taskId: string, payload: { type: string, value?: any }) => void; disabled: boolean; isLoading?: boolean; }) {
  const [email, setEmail] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      onVerify(task.id, { type: 'email', value: email.trim() });
      setIsEditing(false);
    }
  };

  if (task.completed) {
    return (
      <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <span className="text-foreground">{getTaskText(task)}</span>
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
            <span className='flex-grow text-muted-foreground'>{getTaskText(task)}</span>
                         <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setIsEditing(!isEditing)} disabled={disabled || isLoading}>
                 {isLoading ? (
                   <>
                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     Verifying
                   </>
                 ) : isEditing ? 'Cancel' : 'Verify Email'}
             </Button>
        </div>
        {isEditing && (
            <form className="flex w-full space-x-2 pl-8" onSubmit={handleSubmit}>
                <Input
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 h-9"
                    autoFocus
                />
                                 <Button type="submit" size="sm" disabled={!email.trim() || isLoading}>
                     {isLoading ? 'Verifying...' : 'Verify'}
                 </Button>
            </form>
        )}
    </div>
  );
}

function ProfilePictureTask({ task, onVerify, disabled, isLoading = false }: { task: Task; onVerify: (taskId: string, payload: { type: string, value?: any }) => void; disabled: boolean; isLoading?: boolean; }) {
  const [imageUrl, setImageUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (imageUrl.trim()) {
      onVerify(task.id, { type: 'profilePicture', value: imageUrl.trim() });
      setIsEditing(false);
    }
  };

  if (task.completed) {
    return (
      <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <span className="text-foreground">{getTaskText(task)}</span>
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
            <span className='flex-grow text-muted-foreground'>{getTaskText(task)}</span>
                         <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setIsEditing(!isEditing)} disabled={disabled || isLoading}>
                 {isLoading ? (
                   <>
                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     Uploading
                   </>
                 ) : isEditing ? 'Cancel' : 'Upload Picture'}
             </Button>
        </div>
        {isEditing && (
            <form className="flex w-full space-x-2 pl-8" onSubmit={handleSubmit}>
                <Input
                    type="url"
                    placeholder="Enter image URL"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="flex-1 h-9"
                    autoFocus
                />
                                 <Button type="submit" size="sm" disabled={!imageUrl.trim() || isLoading}>
                     {isLoading ? 'Saving...' : 'Save'}
                 </Button>
            </form>
        )}
    </div>
  );
}

function ConnectAccountTask({ text, completed, onVerify, disabled, taskType = 'auto_verify' }: { text: string; completed: boolean; onVerify: (payload: { type: string, value?: any }) => void; disabled: boolean; taskType?: string; }) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    // In a real app, this would trigger an OAuth flow.
    // We simulate it with a delay.
    setTimeout(() => {
      onVerify({ type: taskType });
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
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoadingQuests, setIsLoadingQuests] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [verifyingTasks, setVerifyingTasks] = useState<Set<string>>(new Set());

  const unlockDate = useMemo(() => new Date("2025-07-02T00:00:00"), []);
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

  useEffect(() => {
    const fetchQuests = async () => {
      setIsLoadingQuests(true);
      try {
        const url = user ? `/api/quests?walletAddress=${user.walletAddress}` : '/api/quests';
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch quests');
        let data = await response.json();
        
        // Map icons to the quests
        data = data.map((q: Omit<Quest, 'icon'>) => ({ ...q, icon: iconMap[q.id] || Star }));
        
        setQuests(data);
      } catch (error) {
        console.error(error);
        toast({
          title: 'Error',
          description: 'Could not load quests. Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingQuests(false);
      }
    };

    if (!isAuthLoading) {
        fetchQuests();
    }
  }, [user, isAuthLoading, toast]);

  const starterQuest = useMemo(() => quests.find(q => q.isStarter), [quests]);
  
  const completedQuestsCount = useMemo(() => quests.filter(q => q.isCompleted).length, [quests]);

  const completedStarterTasks = useMemo(() => starterQuest?.tasks.filter(t => t.completed).length ?? 0, [starterQuest]);
  const totalStarterTasks = useMemo(() => starterQuest?.tasks.length ?? 0, [starterQuest]);
  const isStarterTasksComplete = useMemo(() => completedStarterTasks === totalStarterTasks, [completedStarterTasks, totalStarterTasks]);
  const starterProgress = useMemo(() => totalStarterTasks > 0 ? (completedStarterTasks / totalStarterTasks) * 100 : 0, [completedStarterTasks, totalStarterTasks]);

  const displayedQuests = useMemo(() => {
    const isStarterQuestCompleted = starterQuest?.isCompleted ?? false;
    const questList = quests.filter(q => !q.isStarter || (q.isStarter && isStarterQuestCompleted));
    
    if (activeTab === 'all') {
      return questList;
    }
    return questList.filter(q => q.isCompleted === (activeTab === 'completed'));
  }, [quests, activeTab, starterQuest]);

  useEffect(() => {
    console.log("starterQuest", starterQuest);
    console.log("all quests:", quests);
    console.log("displayedQuests:", displayedQuests);
  }, [starterQuest, quests, displayedQuests]);

  const handleVerifyTask = async (questId: string, taskId: string, payload: { type: string, value?: any }) => {
    console.log(`Verifying task ${taskId} for quest ${questId} with payload`, payload);

    if (!user) return;

    const quest = quests.find(q => q.id === questId);
    const task = quest?.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Set loading state
    setVerifyingTasks(prev => new Set(prev).add(taskId));

    try {
      const response = await fetch('/api/quests/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: user.walletAddress,
          taskId: taskId,
          type: payload.type,
          value: payload.value,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to verify task',
          variant: 'destructive',
        });
        return;
      }

      // Update the UI after successful verification
      setQuests(prevQuests => prevQuests.map(q => {
        if (q.id === questId) {
          return {
            ...q,
            tasks: q.tasks.map(t => t.id === taskId ? { ...t, completed: true } : t)
          };
        }
        return q;
      }));

      toast({
        title: 'Task Completed!',
        description: `You completed: "${task.text}".`,
      });

    } catch (error) {
      console.error('Task verification error:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify task. Please try again.',
        variant: 'destructive',
      });
    } finally {
      // Clear loading state
      setVerifyingTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
    }
  };
  
  const handleClaimReward = async (questId: string) => {
    if (!user) return;

    const questToClaim = quests.find(q => q.id === questId);
    if (!questToClaim || questToClaim.isCompleted) return;
    
    try {
      const response = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user.walletAddress, questId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to claim reward.');
      }
      
      const refetchQuests = async () => {
          const url = `/api/quests?walletAddress=${user.walletAddress}`;
          const refetchResponse = await fetch(url);
          let data = await refetchResponse.json();
          data = data.map((q: Omit<Quest, 'icon'>) => ({ ...q, icon: iconMap[q.id] || Star }));
          setQuests(data);
      }
      
      await refetchQuests();

      toast({
        title: 'Quest Completed!',
        description: `You've earned ${result.xpGained} XP. Your new total is ${result.newTotalXp} XP.`,
      });

    } catch (error: any) {
        toast({
            title: 'Claiming Error',
            description: error.message,
            variant: 'destructive',
        });
    }
  };

  const isLoading = isAuthLoading || isLoadingQuests;
  const isWalletConnected = !!user;
  const isLocked = isTimeLocked || !isWalletConnected;
  const isQuestsLocked = starterQuest && !starterQuest.isCompleted && quests.filter(q => !q.isStarter).length > 0;

  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-6">
      <div className={cn("flex flex-col gap-6", isLocked && 'blur-sm pointer-events-none')}>
        <div>
          <h1 className="text-3xl font-bold font-headline">Quests</h1>
          <p className="text-muted-foreground">Complete quests to earn XP and climb the leaderboard.</p>
        </div>

        {starterQuest && !starterQuest.isCompleted && (
          <Card className="bg-card/80 border-primary/50 border-2">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                  <Star className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>{starterQuest.title}</CardTitle>
                  <CardDescription>{starterQuest.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {starterQuest.tasks.map((task) => {
                  const taskText = getTaskText(task);
                  const taskType = getTaskType(taskText);
                  const isLoading = verifyingTasks.has(task.id);
                  
                  switch (taskType) {
                    case 'username':
                      return <UsernameTask key={task.id} task={task} disabled={starterQuest.isLocked} onVerify={(taskId, payload) => handleVerifyTask(starterQuest.id, taskId, payload)} isLoading={isLoading} />
                    
                    case 'email':
                      return <EmailTask key={task.id} task={task} disabled={starterQuest.isLocked} onVerify={(taskId, payload) => handleVerifyTask(starterQuest.id, taskId, payload)} isLoading={isLoading} />
                    
                    case 'profilePicture':
                      return <ProfilePictureTask key={task.id} task={task} disabled={starterQuest.isLocked} onVerify={(taskId, payload) => handleVerifyTask(starterQuest.id, taskId, payload)} isLoading={isLoading} />
                    
                    default:
                      return <ConnectAccountTask key={task.id} text={taskText} completed={task.completed} disabled={starterQuest.isLocked} onVerify={(payload) => handleVerifyTask(starterQuest.id, task.id, payload)} taskType={taskType} />
                  }
              })}
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-4">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Progress</span>
                <span>{completedStarterTasks}/{totalStarterTasks}</span>
              </div>
              <Progress value={starterProgress} />
             <Button onClick={() => handleClaimReward(starterQuest.id)} disabled={!isStarterTasksComplete || starterQuest.isCompleted}>
                  {starterQuest.isCompleted ? 'Reward Claimed' : `Claim ${starterQuest.xp} XP`}
              </Button>
            </CardFooter>
          </Card>
        )}

        <div className="relative">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={cn(isQuestsLocked && 'blur-sm pointer-events-none')}>
              <TabsTrigger value="all">All Quests</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className={cn("pt-4", isQuestsLocked && 'blur-sm pointer-events-none')}>
              <div className="space-y-4">
                {displayedQuests.length > 0 ? (
                  displayedQuests.map(quest => (
                  <Accordion type="single" collapsible key={quest.id} className="w-full" disabled={quest.isLocked}>
                      <AccordionItem value={quest.id} className="border rounded-lg">
                        <AccordionTrigger className="p-4 hover:no-underline data-[state=open]:border-b">
                          <div className="flex items-center gap-4 flex-1">
                              <div className="p-2 bg-muted rounded-md">
                                  {quest.isLocked ? <Lock className="h-6 w-6 text-muted-foreground" /> : <quest.icon className="h-6 w-6 text-muted-foreground" />}
                              </div>
                              <div className="text-left">
                                  <p className="font-semibold">{quest.title}</p>
                                  <p className="text-sm text-muted-foreground">{quest.description}</p>
                              </div>
                              <div className="ml-auto flex items-center gap-4">
                                  <Badge variant="secondary" className="font-mono text-base">
                                      {quest.xp} XP
                                  </Badge>
                                  {quest.isCompleted && <CheckCircle2 className="h-6 w-6 text-primary" />}
                              </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 space-y-4">
                                                      {quest.tasks.map((task) => {
                              const taskText = getTaskText(task);
                              const taskType = getTaskType(taskText);
                              
                              return (
                                <TaskItem 
                                  key={task.id} 
                                  text={taskText} 
                                  completed={task.completed} 
                                  onVerify={(payload) => handleVerifyTask(quest.id, task.id, payload)} 
                                  disabled={quest.isLocked || quest.isCompleted} 
                                  taskType={taskType}
                                  isLoading={verifyingTasks.has(task.id)}
                                />
                              );
                            })}
                            <Button 
                                onClick={() => handleClaimReward(quest.id)} 
                                disabled={quest.tasks.some(t => !t.completed) || quest.isCompleted}
                                className="w-full"
                            >
                                {quest.isCompleted ? 'Claimed' : `Claim ${quest.xp} XP`}
                            </Button>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ))
                ) : (
                    <div className="text-center py-12">
                        <p className="text-muted-foreground">No quests in this category.</p>
                    </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          {isQuestsLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-background/80 backdrop-blur-sm rounded-lg p-4">
              <Lock className="h-8 w-8 text-muted-foreground" />
              <p className="mt-4 text-lg font-semibold">Additional Quests Locked</p>
              <p className="mt-1 text-sm text-muted-foreground">Complete the "Get Started" quest above to unlock additional quests</p>
            </div>
          )}
        </div>
      </div>
      {isLocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-start pt-24 text-center bg-background/80 backdrop-blur-sm rounded-lg p-4">
            <Lock className="h-8 w-8 text-muted-foreground" />
            {isTimeLocked ? (
                <>
                    <p className="mt-4 text-lg font-semibold">Quests are Locked</p>
                    <p className="mt-1 text-sm text-muted-foreground">This feature will be available soon. Check back later!</p>
                    <CountdownTimer targetDate={unlockDate.toISOString()} />
                </>
            ) : !isWalletConnected ? (
                 <>
                    <p className="mt-4 text-lg font-semibold">Wallet Not Connected</p>
                    <p className="mt-1 text-sm text-muted-foreground">Please connect your wallet to view and complete quests.</p>
                </>
            ) : null}
        </div>
      )}
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
