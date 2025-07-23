'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/providers/auth-provider';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2 } from 'lucide-react';

interface UserProfile {
  username: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  bio: string | null;
}

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const hasFetchedRef = useRef(false);
  const [profile, setProfile] = useState<UserProfile>({
    username: '',
    email: '',
    profilePictureUrl: '',
    bio: '',
  });

  const fetchProfile = useCallback(async () => {
    if (!user?.walletAddress || hasFetchedRef.current) return;
    
    hasFetchedRef.current = true;
    try {
      const response = await fetch(`/api/user/profile?walletAddress=${encodeURIComponent(user.walletAddress)}`);
      if (response.ok) {
        const data = await response.json();
        setProfile({
          username: data.username || '',
          email: data.email || '',
          profilePictureUrl: data.profilePictureUrl || '',
          bio: data.bio || '',
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to load profile data",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.walletAddress, toast]);

  useEffect(() => {
    if (!isLoading && user) {
      fetchProfile();
    } else if (!isLoading && !user) {
      setLoading(false);
    }
  }, [isLoading, user, fetchProfile]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: user?.walletAddress,
          username: profile.username || undefined,
          email: profile.email || undefined,
          bio: profile.bio || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setProfile({
          username: data.username || '',
          email: data.email || '',
          profilePictureUrl: data.profilePictureUrl || '',
          bio: data.bio || '',
        });
        toast({
          title: "Profile Updated",
          description: "Your settings have been saved successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update profile",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;

      try {
        const response = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: user?.walletAddress,
            avatar: base64String,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          setProfile(prev => ({
            ...prev,
            profilePictureUrl: data.profilePictureUrl || base64String,
          }));
          toast({
            title: "Avatar Updated",
            description: "Your profile picture has been updated successfully.",
          });
        } else {
          toast({
            title: "Error",
            description: data.error || "Failed to upload avatar",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error uploading avatar:', error);
        toast({
          title: "Error",
          description: "Failed to upload avatar",
          variant: "destructive",
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (field: keyof UserProfile) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setProfile(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  if (loading || isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  // Show locked state if user is not authenticated
  if (!user) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto flex flex-col gap-8">
          <div>
            <h1 className="text-3xl font-bold font-headline">Settings</h1>
            <p className="text-muted-foreground">Manage your account and profile settings.</p>
          </div>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Please connect your wallet to access settings.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const displayAvatar = profile.profilePictureUrl || 'https://placehold.co/100x100.png';
  const avatarFallback = profile.username ? profile.username.charAt(0).toUpperCase() : 'U';

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold font-headline">Settings</h1>
          <p className="text-muted-foreground">Manage your account and profile settings.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Public Profile</CardTitle>
              <CardDescription>This information will be displayed on your public profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={displayAvatar} alt={profile.username || 'User'} />
                    <AvatarFallback>{avatarFallback}</AvatarFallback>
                  </Avatar>
                  <label htmlFor="avatar-upload" className="cursor-pointer">
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="absolute bottom-0 right-0 rounded-full"
                      type="button"
                      asChild
                    >
                      <span>
                        <Camera className="h-4 w-4" />
                        <span className="sr-only">Change photo</span>
                      </span>
                    </Button>
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input 
                    id="username" 
                    value={profile.username || ''} 
                    onChange={handleInputChange('username')}
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={profile.email || ''} 
                  onChange={handleInputChange('email')}
                  placeholder="Enter your email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us a little bit about yourself"
                  value={profile.bio || ''}
                  onChange={handleInputChange('bio')}
                  rows={3}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AppLayout>
  );
}