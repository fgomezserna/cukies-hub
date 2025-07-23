'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/providers/auth-provider';
import AppLayout from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, User, Mail, FileText, Save, Settings as SettingsIcon } from 'lucide-react';

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
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  // Show locked state if user is not authenticated
  if (!user) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent mb-4">
              ⚙️ Settings
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Manage your account and profile settings
            </p>
          </div>
          <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
            <CardContent className="p-8 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold font-headline mb-4">Connect Your Wallet</h2>
              <p className="text-muted-foreground">Please connect your wallet to access settings and customize your profile.</p>
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
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent mb-4">
            ⚙️ Settings
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Manage your account and profile settings
          </p>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-1">
            <TabsTrigger 
              value="profile" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
            >
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger 
              value="preferences" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
            >
              <SettingsIcon className="h-4 w-4 mr-2" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <form onSubmit={handleSubmit}>
              <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-green-400" />
                    Public Profile
                  </CardTitle>
                  <CardDescription>
                    This information will be displayed on your public profile and visible to other players.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative group">
                      <Avatar className="h-24 w-24 border-4 border-primary shadow-lg shadow-primary/20 transition-all duration-300 group-hover:scale-105">
                        <AvatarImage src={displayAvatar} alt={profile.username || 'User'} />
                        <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-green-400 to-emerald-500">
                          {avatarFallback}
                        </AvatarFallback>
                      </Avatar>
                      <label 
                        htmlFor="avatar-upload" 
                        className="absolute bottom-0 right-0 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white p-2 rounded-full shadow-lg shadow-green-500/20 cursor-pointer transition-all duration-300 hover:scale-110 hover:shadow-xl"
                      >
                        <Camera className="h-4 w-4" />
                        <span className="sr-only">Change photo</span>
                      </label>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                    </div>
                    
                    <div className="flex-1 space-y-4 w-full">
                      <div className="space-y-2">
                        <Label htmlFor="username" className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Username
                        </Label>
                        <Input 
                          id="username" 
                          value={profile.username || ''} 
                          onChange={handleInputChange('username')}
                          placeholder="Enter your username"
                          className="border-green-500/20 focus:border-green-400 bg-card/50 backdrop-blur-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email
                        </Label>
                        <Input 
                          id="email" 
                          type="email"
                          value={profile.email || ''} 
                          onChange={handleInputChange('email')}
                          placeholder="Enter your email"
                          className="border-green-500/20 focus:border-green-400 bg-card/50 backdrop-blur-sm"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="bio" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Bio
                    </Label>
                    <Textarea
                      id="bio"
                      placeholder="Tell us a little bit about yourself..."
                      value={profile.bio || ''}
                      onChange={handleInputChange('bio')}
                      rows={3}
                      className="border-green-500/20 focus:border-green-400 bg-card/50 backdrop-blur-sm resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Max 200 characters. This will be visible on your public profile.
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button 
                      type="submit" 
                      disabled={saving}
                      className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-green-500/20 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/30"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          </TabsContent>

          <TabsContent value="preferences" className="mt-6">
            <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5 text-blue-400" />
                  Preferences
                </CardTitle>
                <CardDescription>
                  Customize your experience and notification preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🚧</div>
                  <h3 className="text-xl font-bold font-headline mb-2">Coming Soon</h3>
                  <p className="text-muted-foreground">
                    Advanced preferences and notification settings will be available in a future update.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Wallet Info Card */}
        <Card className="relative overflow-hidden border border-blue-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-blue-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-400">
              🔗 Connected Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-mono text-sm text-muted-foreground break-all">
                  {user.walletAddress}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your wallet address is used for authentication and game rewards.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}