'use client';

import React, { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Circle, Coins, Gamepad2, Lock, Mail, Star, User, Loader2, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react';
import DiscordIcon from '@/components/icons/discord';
import XIcon from '@/components/icons/x-icon';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { User as UserType, Streak } from '@/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import CountdownTimer from '@/components/shared/countdown-timer';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  handleDiscordOAuth,
  handleTwitterOAuth
} from '@/lib/oauth-utils';
import { Suspense } from "react";

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
  
  // Debug logging for all tasks
  const result = getTaskTypeInternal(text);
  console.log('Task type detection:', { original: taskText, normalized: text, result });
  return result;
};

const getTaskTypeInternal = (text: string): string => {
  if (text.includes('username')) return 'username';
  if (text.includes('email')) return 'email';
  if (text.includes('profile picture')) return 'profilePicture';
  if (text.includes('connect') && (text.includes('x account') || text.includes('twitter account'))) return 'twitter_connect';
  if (text.includes('follow') && (text.includes('twitter') || text.includes(' x ') || text.includes('on x') || text.includes('us on x'))) {
    return 'twitter_follow';
  }
  if (text.includes('like') || text.includes('retweet')) return 'twitter_like_rt';
  if (text.includes('pinned post')) return 'twitter_like_rt';
  if (text.includes('connect') && text.includes('discord')) return 'discord_connect';
  if (text.includes('join') && text.includes('discord') && text.includes('server')) return 'discord_join';
  if (text.includes('telegram') && text.includes('join')) return 'telegram_join';
  if (text.includes('play') || text.includes('game')) return 'game_play';
  if (text.includes('score') || text.includes('points')) return 'game_play';
  
  return 'auto_verify';
};

const TaskItem = ({ text, completed, onVerify, disabled, taskType = 'auto_verify', isLoading = false }: { text: string; completed: boolean; onVerify: (payload: { type: string, value?: any }) => void; disabled: boolean; taskType?: string; isLoading?: boolean; }) => (
  <div className={cn(
    "flex items-center gap-4 py-4 px-5 rounded-xl transition-all duration-300 border-2",
    completed 
      ? "bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30" 
      : "bg-gradient-to-r from-blue-500/5 to-cyan-500/5 border-blue-500/20 hover:border-blue-400/40"
  )}>
    <div className={cn(
      "p-1 rounded-full",
      completed ? "bg-green-500/20" : "bg-blue-500/20"
    )}>
      {completed ? (
        <CheckCircle2 className="h-5 w-5 text-green-400" /> 
      ) : (
        <Circle className="h-5 w-5 text-blue-400" />
      )}
    </div>
    <span className={cn(
      "flex-1 font-medium",
      completed ? 'text-green-400' : 'text-foreground'
    )}>
      {text}
    </span>
    <Button 
      size="sm" 
      variant={completed ? "outline" : "default"}
      className={cn(
        "transition-all duration-300 font-semibold px-4 py-2 rounded-lg",
        completed 
          ? "border-green-500/30 text-green-400 hover:bg-green-500/10" 
          : "bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
      )}
      disabled={completed || disabled || isLoading} 
      onClick={() => onVerify({ type: taskType })}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Verificando...
        </>
      ) : completed ? '✅ Verificado' : '🔍 Verificar'}
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

function DiscordJoinTask({ task, onVerify, disabled, isLoading = false, user }: { task: Task; onVerify: (taskId: string, payload: { type: string, value?: any }) => void; disabled: boolean; isLoading?: boolean; user: UserType | null; }) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('https://discord.gg/hyppie');
  const { toast } = useToast();

  // Get Discord invite URL on component mount
  useEffect(() => {
    const fetchInviteUrl = async () => {
      try {
        const response = await fetch('/api/discord/invite-url');
        if (response.ok) {
          const data = await response.json();
          setInviteUrl(data.inviteUrl);
        }
      } catch (error) {
        console.error('Failed to fetch Discord invite URL:', error);
      }
    };
    fetchInviteUrl();
  }, []);

  const handleVerifyMembership = async () => {
    if (!user) return;
    
    setIsVerifying(true);
    try {
      const response = await fetch('/api/discord/verify-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user.walletAddress }),
      });

      const data = await response.json();

      if (response.ok) {
        // User is in the server, complete the task
        onVerify(task.id, { type: 'discord_join' });
        toast({
          title: 'Success!',
          description: 'Discord server membership verified!',
        });
      } else {
        // Handle different error cases
        if (data.requiresConnection) {
          toast({
            title: 'Discord Not Connected',
            description: 'Please connect your Discord account first.',
            variant: 'destructive',
          });
        } else if (data.requiresReconnection) {
          toast({
            title: 'Discord Connection Expired',
            description: 'Please reconnect your Discord account.',
            variant: 'destructive',
          });
        } else if (data.requiresJoin) {
          // Show modal to help user join the server
          setShowJoinModal(true);
        } else {
          toast({
            title: 'Verification Failed',
            description: data.error || 'Unable to verify Discord membership.',
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('Discord verification error:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify Discord membership. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
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
    <>
      <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
        <Circle className="h-5 w-5 text-muted-foreground" />
        <span className="flex-grow text-muted-foreground">{getTaskText(task)}</span>
        
        <div className="flex items-center gap-2">
          {/* Join Discord Button */}
          <Button
            asChild
            size="sm"
            variant="outline"
            className="text-xs"
          >
            <a 
              href={inviteUrl}
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Join Discord
            </a>
          </Button>

          {/* Verify Button */}
          <Button
            size="sm"
            className="text-xs"
            disabled={disabled || isVerifying || isLoading}
            onClick={handleVerifyMembership}
          >
            {isVerifying || isLoading ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Checking...
              </>
            ) : (
              'Verify'
            )}
          </Button>
        </div>
      </div>

      <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DiscordIcon className="h-5 w-5 text-indigo-500" />
              Join Our Discord Server
            </DialogTitle>
            <DialogDescription>
              You need to join our Discord server to complete this task. Click the button below to join and then come back to verify.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Steps to complete:</p>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Click "Join Discord Server" below</li>
                <li>Accept the invite and join the server</li>
                <li>Come back and click "I've Joined" to verify</li>
              </ol>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowJoinModal(false)}>
              Cancel
            </Button>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <a 
                href={inviteUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Join Discord Server
              </a>
            </Button>
            <Button 
              onClick={() => {
                setShowJoinModal(false);
                handleVerifyMembership();
              }}
              variant="secondary"
            >
              I've Joined
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TelegramJoinTask({ task, onVerify, disabled, isLoading = false, user }: { task: Task; onVerify: (taskId: string, payload: { type: string, value?: any }) => void; disabled: boolean; isLoading?: boolean; user: UserType | null; }) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [telegramGroupInfo, setTelegramGroupInfo] = useState<{
    title: string;
    inviteLink: string | null;
    fallbackLink: string | null;
  } | null>(null);
  const { toast } = useToast();

  // Get Telegram group info on component mount
  useEffect(() => {
    const fetchGroupInfo = async () => {
      try {
        const response = await fetch('/api/telegram/group-invite');
        if (response.ok) {
          const data = await response.json();
          setTelegramGroupInfo({
            title: data.chatInfo.title,
            inviteLink: data.inviteLink,
            fallbackLink: data.fallbackLink
          });
        }
      } catch (error) {
        console.error('Failed to fetch Telegram group info:', error);
      }
    };
    fetchGroupInfo();
  }, []);

  const generateVerificationCode = async () => {
    setIsGeneratingCode(true);
    try {
      const response = await fetch('/api/telegram/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user?.walletAddress }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate code');
      }

      const data = await response.json();
      setGeneratedCode(data.verificationCode);
      setCodeSent(false);
      setShowCodeModal(true);
      setCodeCopied(false);
      
      toast({
        title: 'Code Generated!',
        description: `Your verification code is: ${data.verificationCode}`,
      });
    } catch (error) {
      console.error('Error generating code:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate verification code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const copyCodeToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCodeCopied(true);
      toast({
        title: 'Code Copied!',
        description: 'Verification code copied to clipboard',
      });
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy code to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleVerifyMembership = async () => {
    if (!generatedCode.trim()) {
      toast({
        title: 'No Code Generated',
        description: 'Please generate a code first',
        variant: 'destructive',
      });
      return;
    }

    setIsVerifying(true);
    try {
      onVerify(task.id, { type: 'telegram_join', value: generatedCode.trim() });
    } catch (error) {
      console.error('Telegram verification error:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify Telegram membership. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
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
    <>
      <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
        <Circle className="h-5 w-5 text-muted-foreground" />
        <span className="flex-grow text-muted-foreground">{getTaskText(task)}</span>
        
        <div className="flex items-center gap-2">
          {/* Join Group Button */}
          {telegramGroupInfo && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs"
            >
              <a 
                href={telegramGroupInfo.inviteLink || telegramGroupInfo.fallbackLink || 'https://t.me/hyppie'}
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Join Group
              </a>
            </Button>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            {/* Generate/Regenerate Code Button */}
            <Button
              onClick={generateVerificationCode}
              disabled={disabled || isGeneratingCode || isLoading}
              size="sm"
              variant={generatedCode || codeSent ? "outline" : "default"}
              className="text-xs"
            >
              {isGeneratingCode ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Generating...
                </>
              ) : (
                generatedCode || codeSent ? 'Generate New Code' : 'Generate Code'
              )}
            </Button>

            {/* Show Code Button - only when code exists but modal is closed */}
            {generatedCode && !codeSent && (
              <Button
                onClick={() => setShowCodeModal(true)}
                disabled={disabled}
                size="sm"
                variant="outline"
                className="text-xs"
              >
                Show Code
              </Button>
            )}

            {/* Verify Button - only when code has been sent */}
            {(generatedCode || codeSent) && (
              <Button
                onClick={handleVerifyMembership}
                disabled={disabled || isVerifying || isLoading}
                size="sm"
                className="text-xs"
              >
                {isVerifying || isLoading ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Code Modal */}
      <Dialog open={showCodeModal && !!generatedCode && !task.completed} onOpenChange={() => setShowCodeModal(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verification Code</DialogTitle>
            <DialogDescription>
              Send this code to our Telegram group to verify your membership.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                Step 1: Copy this code
              </p>
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-3 rounded border">
                <div className="font-mono text-center text-xl font-bold flex-1 select-all">
                  {generatedCode}
                </div>
                <Button
                  onClick={copyCodeToClipboard}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                >
                  {codeCopied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Copy this code and send it as a message in our Telegram group.
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Step 2:</strong> After sending the code, close this modal and click "Verify" to complete the task.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              onClick={() => {
                setShowCodeModal(false);
                generateVerificationCode();
              }}
              variant="outline"
              className="flex-1"
            >
              Generate New Code
            </Button>
            <Button 
              onClick={() => {
                setShowCodeModal(false);
                setCodeSent(true);
              }}
              className="flex-1"
            >
              Code Sent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConnectAccountTask({ text, completed, onVerify, disabled, taskType = 'auto_verify', questId, taskId, user }: { text: string; completed: boolean; onVerify: (payload: { type: string, value?: any }) => void; disabled: boolean; taskType?: string; questId: string; taskId: string; user: UserType | null; }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const getExternalLink = () => {
    switch (taskType) {
      case 'twitter_follow':
        return {
          url: process.env.NEXT_PUBLIC_TWITTER_PROFILE_URL || 'https://x.com/hyppieliquid',
          text: 'Follow on X',
          description: 'Follow us on X (Twitter) first, then connect your account'
        };
      case 'twitter_like_rt':
        return {
          url: process.env.NEXT_PUBLIC_TWITTER_PROFILE_URL || 'https://x.com/hyppieliquid',
          text: 'Go to X Profile',
          description: 'Visit our X profile to like and retweet our pinned post'
        };
      // twitter_connect and discord_connect don't need external links - they're pure OAuth
      default:
        return null;
    }
  };

  const handleConnect = async () => {
    if (completed || disabled) return;

    setIsConnecting(true);
    try {
      if (taskType === 'discord_connect') {
        const data = await handleDiscordOAuth(user?.walletAddress);
        
        // Use Discord username for verification
        const discordUsername = data.discordUser.discriminator 
          ? `${data.discordUser.username}#${data.discordUser.discriminator}`
          : data.discordUser.username;
        
        onVerify({ type: taskType, value: discordUsername });
        
      } else if (taskType === 'twitter_connect' || taskType === 'twitter_follow') {
        const data = await handleTwitterOAuth(user?.walletAddress);
        
        // Use Twitter username for verification
        onVerify({ type: taskType, value: data.twitterUser.username });
        
      } else if (taskType === 'twitter_like_rt') {
        // For like and retweet tasks, we'll trust the user (or implement later verification)
        onVerify({ type: taskType });
      } else {
        // Para otros tipos simplemente verificamos al instante
        onVerify({ type: taskType });
      }
    } catch (error) {
      console.error('OAuth flow failed:', error);
      
      let title = 'Connection Failed';
      let description = (error as Error)?.message || 'An unexpected error occurred';
      
      if (taskType === 'discord_connect') {
        title = 'Discord Connection Failed';
      } else if (taskType === 'twitter_connect' || taskType === 'twitter_follow') {
        title = 'X/Twitter Connection Failed';
      }
      
      toast({
        title,
        description,
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const externalLink = getExternalLink();

  return (
    <div className="flex items-center gap-3 py-2 px-4 rounded-md bg-muted/50">
      {completed ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
      <span className={cn('flex-grow', completed ? 'text-foreground' : 'text-muted-foreground')}>{text}</span>
      
      <div className="flex items-center gap-2">
        {/* External Link Button */}
        {externalLink && !completed && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="text-xs"
          >
            <a 
              href={externalLink.url}
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              {externalLink.text}
            </a>
          </Button>
        )}

        {/* Connect/Verify Button */}
        <Button
          size="sm"
          variant={completed ? "ghost" : "default"}
          className="text-xs"
          disabled={completed || isConnecting || disabled}
          onClick={handleConnect}
        >
          {isConnecting ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {taskType === 'twitter_like_rt' ? 'Verifying' : 'Connecting'}
            </>
          ) : completed ? (
            taskType === 'twitter_like_rt' ? 'Verified' : 'Connected'
          ) : (
            taskType === 'twitter_like_rt' ? 'Verify' : 'Connect'
          )}
        </Button>
      </div>
    </div>
  );
}

function QuestsView() {
  const { user, isLoading: isAuthLoading, fetchUser } = useAuth();
  const { toast } = useToast();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoadingQuests, setIsLoadingQuests] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [verifyingTasks, setVerifyingTasks] = useState<Set<string>>(new Set());
  const router = useRouter();
  const searchParams = useSearchParams();

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
        // Handle specific error cases with more helpful messages
        let title = 'Verification Failed';
        let description = data.error || 'Failed to verify task';
        
        if (response.status === 409) {
          title = 'Username Already Taken';
          description = 'This username is already verified by another user. Please use a different username.';
        } else if (response.status === 404) {
          title = 'User Not Found';
          description = 'The username was not found. Please check your username and try again.';
        } else if (response.status === 403 && data.requiresJoin) {
          title = 'Join Required';
          description = 'You need to join the group first before verifying membership.';
        }
        
        toast({
          title,
          description,
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
        description: `You completed: "${getTaskText(task)}".`,
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

      // Refresh the authenticated user so other sections (e.g., Points page) react immediately
      fetchUser();

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

  // Auto-verify after OAuth redirect
  useEffect(() => {
    const questIdParam = searchParams.get('verify');
    const taskIdParam = searchParams.get('task');
    const typeParam = searchParams.get('type');

    if (questIdParam && taskIdParam && typeParam && user) {
      // Evitar doble ejecución
      handleVerifyTask(questIdParam, taskIdParam, { type: typeParam });
      // Limpiar la URL
      router.replace('/quests');
    }
  }, [searchParams, user]);

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
    <div className="relative flex flex-col gap-8">
      <div className={cn("flex flex-col gap-8", isLocked && 'blur-sm pointer-events-none')}>
        {/* Header moderno */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            🏆 Mission Center
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Complete missions to earn XP and climb the ranking. Every completed quest brings you closer to the top!
          </p>
          <div className="flex justify-center items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              {completedQuestsCount} Completed
            </span>
            <span className="flex items-center gap-1">
              <Circle className="h-4 w-4 text-blue-400" />
              {quests.length - completedQuestsCount} Pending
            </span>
          </div>
        </div>

        {starterQuest && !starterQuest.isCompleted && (
          <Card className="relative overflow-hidden border-2 border-blue-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-blue-500/20 hover:border-blue-400/40 transition-all duration-300">
            <CardHeader className="relative">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-2xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Star className="h-8 w-8 text-white drop-shadow-lg" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">
                    ✨ {starterQuest.title}
                  </CardTitle>
                  <CardDescription className="text-base mt-1">
                    {starterQuest.description}
                  </CardDescription>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">Starter Quest</span>
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
                    
                    case 'discord_join':
                      return <DiscordJoinTask key={task.id} task={task} disabled={starterQuest.isLocked} onVerify={(taskId, payload) => handleVerifyTask(starterQuest.id, taskId, payload)} isLoading={isLoading} user={user} />
                    
                    case 'telegram_join':
                      return <TelegramJoinTask key={task.id} task={task} disabled={starterQuest.isLocked} onVerify={(taskId, payload) => handleVerifyTask(starterQuest.id, taskId, payload)} isLoading={isLoading} user={user} />
                    
                    default:
                      return <ConnectAccountTask key={task.id} text={taskText} completed={task.completed} disabled={starterQuest.isLocked} onVerify={(payload) => handleVerifyTask(starterQuest.id, task.id, payload)} taskType={taskType} questId={starterQuest.id} taskId={task.id} user={user} />
                  }
              })}
            </CardContent>
            <CardFooter className="relative flex-col items-stretch gap-6 bg-gradient-to-r from-blue-500/5 to-cyan-500/5">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">🎯 Progress</span>
                  <span className="text-sm font-bold text-foreground px-2 py-1 rounded-full bg-blue-500/20">
                    {completedStarterTasks}/{totalStarterTasks}
                  </span>
                </div>
                <div className="relative">
                  <Progress value={starterProgress} className="h-3" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-cyan-500/20 rounded-full" />
                </div>
              </div>
              
              <Button 
                onClick={() => handleClaimReward(starterQuest.id)} 
                disabled={!isStarterTasksComplete || starterQuest.isCompleted}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/40 disabled:opacity-50 disabled:hover:scale-100"
              >
                {starterQuest.isCompleted ? '✅ Reward Claimed' : `🚀 Claim ${starterQuest.xp} XP`}
              </Button>
            </CardFooter>
          </Card>
        )}

        <div className="relative">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={cn("grid w-full grid-cols-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-1", isQuestsLocked && 'blur-sm pointer-events-none')}>
              <TabsTrigger 
                value="all"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
              >
                📋 All
              </TabsTrigger>
              <TabsTrigger 
                value="active"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
              >
                ⚡ Active
              </TabsTrigger>
              <TabsTrigger 
                value="completed"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
              >
                ✅ Completed
              </TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className={cn("pt-4", isQuestsLocked && 'blur-sm pointer-events-none')}>
              <div className="space-y-4">
                {displayedQuests.length > 0 ? (
                  displayedQuests.map((quest, index) => (
                  <Accordion type="single" collapsible key={quest.id} className="w-full" disabled={quest.isLocked}>
                      <AccordionItem 
                        value={quest.id} 
                        className={cn(
                          "border-2 rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-lg",
                          quest.isCompleted 
                            ? "border-green-500/30 bg-gradient-to-br from-green-500/5 to-emerald-500/5 hover:shadow-green-500/20" 
                            : "border-blue-500/20 bg-gradient-to-br from-card to-card/50 hover:border-blue-400/40 hover:shadow-blue-500/20",
                          quest.isLocked && "border-gray-500/20 bg-gradient-to-br from-card/50 to-card/30"
                        )}
                      >
                        <AccordionTrigger className="p-6 hover:no-underline data-[state=open]:border-b data-[state=open]:border-current/20 group">
                          <div className="flex items-center gap-6 flex-1">
                              <div className="relative">
                                <div className={cn(
                                  "p-3 rounded-2xl transition-all duration-300 group-hover:scale-110",
                                  quest.isCompleted 
                                    ? "bg-gradient-to-br from-green-400 to-emerald-500" 
                                    : quest.isLocked 
                                      ? "bg-gradient-to-br from-gray-400 to-gray-500"
                                      : "bg-gradient-to-br from-blue-400 to-cyan-500"
                                )}>
                                  {quest.isLocked ? (
                                    <Lock className="h-7 w-7 text-white drop-shadow-lg" />
                                  ) : (
                                    <quest.icon className="h-7 w-7 text-white drop-shadow-lg" />
                                  )}
                                </div>
                                {/* Quest number */}
                                <div className="absolute -top-2 -right-2 w-6 h-6 bg-black/80 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                  {index + 1}
                                </div>
                              </div>
                              
                              <div className="text-left flex-1">
                                  <p className={cn(
                                    "font-bold text-lg transition-colors",
                                    quest.isCompleted ? "text-green-400" : "text-foreground group-hover:text-primary"
                                  )}>
                                    {quest.title}
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-1">{quest.description}</p>
                              </div>
                              
                              <div className="flex items-center gap-4">
                                  <Badge 
                                    variant="secondary" 
                                    className={cn(
                                      "font-mono text-base py-1 px-3 rounded-xl font-bold",
                                      quest.isCompleted 
                                        ? "bg-green-500/20 text-green-400 border border-green-400/30"
                                        : "bg-blue-500/20 text-blue-400 border border-blue-400/30"
                                    )}
                                  >
                                      💎 {quest.xp} XP
                                  </Badge>
                                  {quest.isCompleted && (
                                    <div className="p-2 rounded-full bg-green-500/20">
                                      <CheckCircle2 className="h-6 w-6 text-green-400" />
                                    </div>
                                  )}
                              </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6 space-y-6 bg-gradient-to-r from-muted/20 to-muted/10">
                            <div className="space-y-3">
                              {quest.tasks.map((task, taskIndex) => {
                                const taskText = getTaskText(task);
                                const taskType = getTaskType(taskText);
                                const isLoading = verifyingTasks.has(task.id);
                                
                                return (
                                  <div key={task.id} className="relative">
                                    <div className="absolute left-0 top-0 w-6 h-6 bg-black/80 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                      {taskIndex + 1}
                                    </div>
                                    <div className="ml-8">
                                      {(() => {
                                        switch (taskType) {
                                          case 'username':
                                            return <UsernameTask key={task.id} task={task} disabled={quest.isLocked || quest.isCompleted} onVerify={(taskId, payload) => handleVerifyTask(quest.id, taskId, payload)} isLoading={isLoading} />
                                          
                                          case 'email':
                                            return <EmailTask key={task.id} task={task} disabled={quest.isLocked || quest.isCompleted} onVerify={(taskId, payload) => handleVerifyTask(quest.id, taskId, payload)} isLoading={isLoading} />
                                          
                                          case 'profilePicture':
                                            return <ProfilePictureTask key={task.id} task={task} disabled={quest.isLocked || quest.isCompleted} onVerify={(taskId, payload) => handleVerifyTask(quest.id, taskId, payload)} isLoading={isLoading} />
                                          
                                          case 'discord_join':
                                            return <DiscordJoinTask key={task.id} task={task} disabled={quest.isLocked || quest.isCompleted} onVerify={(taskId, payload) => handleVerifyTask(quest.id, taskId, payload)} isLoading={isLoading} user={user} />
                                          
                                          case 'telegram_join':
                                            return <TelegramJoinTask key={task.id} task={task} disabled={quest.isLocked || quest.isCompleted} onVerify={(taskId, payload) => handleVerifyTask(quest.id, taskId, payload)} isLoading={isLoading} user={user} />
                                          
                                          default:
                                            return <ConnectAccountTask key={task.id} text={taskText} completed={task.completed} disabled={quest.isLocked || quest.isCompleted} onVerify={(payload) => handleVerifyTask(quest.id, task.id, payload)} taskType={taskType} questId={quest.id} taskId={task.id} user={user} />
                                        }
                                      })()}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            <div className="pt-4 border-t border-current/10">
                              <Button 
                                onClick={() => handleClaimReward(quest.id)} 
                                disabled={quest.tasks.some(t => !t.completed) || quest.isCompleted}
                                className={cn(
                                  "w-full font-bold py-4 rounded-xl shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100",
                                  quest.isCompleted 
                                    ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-green-500/30 hover:shadow-green-500/40"
                                    : "bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-blue-500/30 hover:shadow-blue-500/40"
                                )}
                              >
                                {quest.isCompleted ? '✅ Claimed' : `🚀 Claim ${quest.xp} XP`}
                              </Button>
                            </div>
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
      <Suspense fallback={<div>Loading quests...</div>}>
        <QuestsView />
      </Suspense>
    </AppLayout>
  )
}
