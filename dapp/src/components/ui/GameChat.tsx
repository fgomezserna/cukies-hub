'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, Users, Reply, X } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface ChatMessage {
  id: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'STICKER' | 'SYSTEM';
  userId?: string;
  user?: {
    id: string;
    username?: string;
    walletAddress: string;
    profilePictureUrl?: string;
  };
  telegramUserId?: number;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  isFromTelegram: boolean;
  isFromWeb: boolean;
  replyTo?: {
    id: string;
    content: string;
    user?: {
      id: string;
      username?: string;
      walletAddress: string;
    };
  };
  createdAt: string;
  updatedAt: string;
  isNew?: boolean;
}

interface GameChatProps {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function GameChat({ gameId, isOpen, onClose }: GameChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const checkingForMessages = useRef(false);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch initial messages
  const fetchMessages = async () => {
    if (!user?.walletAddress) return;

    setIsLoading(true);
    try {
      console.log('🔄 Fetching messages for gameId:', gameId);
      const response = await fetch(`/api/chat/rooms/${gameId}/messages?limit=50&walletAddress=${encodeURIComponent(user.walletAddress)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('📨 Received messages:', data.length);
        setMessages(data);
        setTimeout(scrollToBottom, 100);
      } else {
        console.error('❌ API response error:', response.status);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoading(false);
    }
  };


  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user?.walletAddress || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch(`/api/chat/rooms/${gameId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: user.walletAddress,
          content: newMessage.trim(),
          messageType: 'TEXT',
          replyToId: replyTo?.id,
        }),
      });

      if (response.ok) {
        const message = await response.json();
        setMessages(prev => [...prev, message]);
        setNewMessage('');
        setReplyTo(null);
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Join room when component mounts
  useEffect(() => {
    if (isOpen && user?.walletAddress) {
      // Auto-join room
      fetch(`/api/chat/rooms/${gameId}/join`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: user.walletAddress })
      })
        .then(() => fetchMessages())
        .catch(console.error);
    }
  }, [isOpen, user?.walletAddress, gameId]);

  // Check for new messages without full refresh
  const checkForNewMessages = useCallback(async () => {
    if (!user?.walletAddress || checkingForMessages.current) return;
    
    checkingForMessages.current = true;
    try {
      if (messages.length === 0) {
        await fetchMessages();
        return;
      }

      const lastMessageTime = messages[messages.length - 1]?.createdAt;
      const response = await fetch(`/api/chat/rooms/${gameId}/messages?limit=10&after=${encodeURIComponent(lastMessageTime)}&walletAddress=${encodeURIComponent(user.walletAddress)}`);
      
      if (response.ok) {
        const newData = await response.json();
        if (newData.length > 0) {
          const newMessages = newData.map((msg: ChatMessage) => ({ ...msg, isNew: true }));
          setMessages(prev => {
            const actuallyNewMessages = newMessages.filter(msg => 
              !prev.some(existing => existing.id === msg.id)
            );
            
            if (actuallyNewMessages.length > 0) {
              setTimeout(scrollToBottom, 50);
              setTimeout(() => {
                setMessages(msgs => msgs.map(msg => ({ ...msg, isNew: false })));
              }, 600);
              
              return [...prev, ...actuallyNewMessages];
            }
            return prev;
          });
        }
      }
    } catch (error) {
      console.error('Error checking for new messages:', error);
    } finally {
      checkingForMessages.current = false;
    }
  }, [user?.walletAddress, gameId, messages]);

  // Poll for new messages and sync from Telegram
  useEffect(() => {
    if (!isOpen || !user?.walletAddress) return;

    const interval = setInterval(checkForNewMessages, 3000);
    
    return () => clearInterval(interval);
  }, [isOpen, checkForNewMessages]);

  // Get display name for message author - memoized to avoid recreating
  const getDisplayName = useCallback((message: ChatMessage) => {
    if (message.messageType === 'SYSTEM') {
      return 'System';
    }
    
    // For Telegram messages, prioritize Telegram user info
    if (message.isFromTelegram) {
      if (message.telegramUsername) {
        return `@${message.telegramUsername}`;
      }
      
      if (message.telegramFirstName || message.telegramLastName) {
        return `${message.telegramFirstName || ''} ${message.telegramLastName || ''}`.trim();
      }
      
      return 'Telegram User';
    }
    
    // For web messages, use web user info
    if (message.user) {
      return message.user.username || 
             `${message.user.walletAddress.slice(0, 6)}...${message.user.walletAddress.slice(-4)}`;
    }
    
    return 'Anonymous';
  }, []);

  const handleReply = (message: ChatMessage) => {
    setReplyTo(message);
  };

  if (!isOpen) return null;

  return (
    <>
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-full sm:w-96 bg-card border-l border-border flex flex-col z-[100]">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Game Chat</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{memberCount}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const messageClasses = `flex flex-col gap-1 transition-all duration-300 ${
                message.messageType === 'SYSTEM' ? 'items-center' : 'items-start'
              } ${message.isNew ? 'animate-fade-in-up opacity-0' : 'opacity-100'}`;
              
              return (
                <div
                  key={message.id}
                  className={messageClasses}
                  style={{
                    animation: message.isNew ? 'fadeInUp 0.4s ease-out forwards' : undefined
                  }}
                >
                {message.messageType === 'SYSTEM' ? (
                  <div className="text-xs text-muted-foreground italic">
                    {message.content}
                  </div>
                ) : (
                  <>
                    {message.replyTo && (
                      <div className="ml-4 pl-2 border-l-2 border-muted bg-muted/20 rounded p-2 text-sm">
                        <div className="font-medium text-xs text-muted-foreground">
                          {getDisplayName(message.replyTo as ChatMessage)}
                        </div>
                        <div className="text-xs opacity-75">
                          {message.replyTo.content}
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2 w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {getDisplayName(message)}
                          </span>
                          {message.isFromTelegram && (
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-1 rounded">
                              TG
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(message.createdAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                        </div>
                        <div className="text-sm break-words">
                          {message.content}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReply(message)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Reply className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply Preview */}
      {replyTo && (
        <div className="p-2 border-t border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                Replying to {getDisplayName(replyTo)}
              </div>
              <div className="text-sm truncate">
                {replyTo.content}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplyTo(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-4 border-t border-border">
        <form onSubmit={sendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            disabled={isSending}
            maxLength={2000}
          />
          <Button type="submit" disabled={!newMessage.trim() || isSending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
      </div>
    </>
  );
}