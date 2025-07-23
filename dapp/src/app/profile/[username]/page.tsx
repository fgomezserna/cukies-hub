'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/app-layout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Gamepad2, 
  Medal, 
  TrendingUp, 
  BarChart, 
  Trophy, 
  Star, 
  Clock, 
  Users,
  Loader2,
  ArrowLeft,
  Calendar,
  Target,
  Coins
} from 'lucide-react';
import Link from 'next/link';

interface UserProfile {
  username: string;
  profilePictureUrl: string | null;
  bio: string | null;
  xp: number;
  tier: string;
  joinedAt: string;
  stats: {
    totalGamesPlayed: number;
    gamesWon: number;
    winRate: string;
    avgScore: number;
    highestScore: number;
    favoriteGame: string;
    questsCompleted: number;
    tasksCompleted: number;
    totalReferrals: number;
    referralRewards: number;
  };
  recentActivity: Array<{
    gameId: string;
    score: number;
    won: boolean;
    date: string;
  }>;
  pointHistory: Array<{
    id: string;
    amount: number;
    type: string;
    reason: string;
    createdAt: string;
  }>;
  achievements: {
    questsCompleted: Array<{
      title: string;
      xp: number;
    }>;
    tasksCompleted: number;
  };
}

export default function ProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/profile/${encodeURIComponent(username)}`);
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
        } else if (response.status === 404) {
          setError('User not found');
        } else {
          setError('Failed to load profile');
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (error || !profile) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h1 className="text-4xl font-bold font-headline mb-4">
              {error || 'Profile Not Found'}
            </h1>
            <p className="text-muted-foreground mb-8">
              {error === 'User not found' 
                ? `The profile for "${username}" could not be located.`
                : 'Something went wrong while loading the profile.'
              }
            </p>
            <Button asChild>
              <Link href="/leaderboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Leaderboard
              </Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatGameId = (gameId: string) => {
    const gameNames: Record<string, string> = {
      'sybil-slayer': 'Sybil Slayer',
      'hyppie-road': 'Hyppie Road',
      'tower-builder': 'Hyppie Tower'
    };
    return gameNames[gameId] || gameId;
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      'Bronze': 'from-orange-400 to-orange-600',
      'Silver': 'from-gray-300 to-gray-500',
      'Gold': 'from-yellow-400 to-yellow-600',
      'Diamond': 'from-blue-400 to-purple-600'
    };
    return colors[tier] || colors['Bronze'];
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent mb-4">
            👤 Player Profile
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore {profile.username}'s gaming stats, achievements, and activity
          </p>
        </div>

        {/* Profile Header Card */}
        <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-primary shadow-lg shadow-primary/20">
                <AvatarImage 
                  src={profile.profilePictureUrl || 'https://placehold.co/150x150.png?text=' + profile.username.charAt(0)} 
                  alt={profile.username}
                />
                <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-green-400 to-emerald-500">
                  {profile.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="text-center sm:text-left flex-1">
                <h2 className="text-3xl font-bold font-headline mb-2">{profile.username}</h2>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-4">
                  <Badge 
                    variant="outline" 
                    className={`bg-gradient-to-r ${getTierColor(profile.tier)} text-white border-0 px-4 py-1 font-semibold`}
                  >
                    <Medal className="h-4 w-4 mr-1" />
                    {profile.tier} Tier
                  </Badge>
                  <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">
                    <Star className="h-4 w-4 mr-1" />
                    {profile.xp.toLocaleString()} XP
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    <Calendar className="h-4 w-4 mr-1" />
                    Joined {formatDate(profile.joinedAt)}
                  </Badge>
                </div>
                {profile.bio && (
                  <p className="text-muted-foreground max-w-prose">{profile.bio}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Games Played</CardTitle>
              <Gamepad2 className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.stats.totalGamesPlayed}</div>
              <p className="text-xs text-muted-foreground">
                {profile.stats.gamesWon} wins
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-blue-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-blue-500/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.stats.winRate}</div>
              <p className="text-xs text-muted-foreground">
                Success rate
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-yellow-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-yellow-500/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-yellow-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">High Score</CardTitle>
              <Trophy className="h-4 w-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.stats.highestScore.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Best performance
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border border-purple-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-purple-500/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Quests</CardTitle>
              <Target className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.stats.questsCompleted}</div>
              <p className="text-xs text-muted-foreground">
                Completed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-1">
            <TabsTrigger 
              value="activity" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
            >
              <Clock className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
            <TabsTrigger 
              value="achievements" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
            >
              <Trophy className="h-4 w-4 mr-2" />
              Achievements
            </TabsTrigger>
            <TabsTrigger 
              value="stats" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
            >
              <BarChart className="h-4 w-4 mr-2" />
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-6">
            <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
              <CardHeader>
                <CardTitle>Recent Game Activity</CardTitle>
                <CardDescription>Latest games played by {profile.username}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-green-500/20">
                      <TableHead>Game</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.recentActivity.length > 0 ? profile.recentActivity.map((activity, index) => (
                      <TableRow key={index} className="border-green-500/10 hover:bg-green-500/5">
                        <TableCell className="font-medium">{formatGameId(activity.gameId)}</TableCell>
                        <TableCell className="font-mono text-primary">{activity.score.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={activity.won ? "default" : "secondary"} className={activity.won ? "bg-green-500/20 text-green-400" : ""}>
                            {activity.won ? "Won" : "Lost"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatDate(activity.date)}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                          No recent activity to display.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-400" />
                    Completed Quests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profile.achievements.questsCompleted.length > 0 ? (
                    <div className="space-y-3">
                      {profile.achievements.questsCompleted.slice(0, 5).map((quest, index) => (
                        <div key={index} className="flex justify-between items-center p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                          <span className="font-medium">{quest.title}</span>
                          <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                            +{quest.xp} XP
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      No quests completed yet
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-400" />
                    Referral Stats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Referrals</span>
                      <span className="text-2xl font-bold">{profile.stats.totalReferrals}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Referral Rewards</span>
                      <span className="text-2xl font-bold text-green-400">
                        {profile.stats.referralRewards}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
                <CardHeader>
                  <CardTitle>Game Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average Score</span>
                    <span className="font-bold">{profile.stats.avgScore.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Favorite Game</span>
                    <span className="font-bold">{formatGameId(profile.stats.favoriteGame)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tasks Completed</span>
                    <span className="font-bold">{profile.stats.tasksCompleted}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-yellow-400" />
                    Recent Points
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profile.pointHistory.length > 0 ? (
                    <div className="space-y-2">
                      {profile.pointHistory.slice(0, 3).map((transaction) => (
                        <div key={transaction.id} className="flex justify-between items-center p-2 rounded bg-green-500/5">
                          <div>
                            <div className="text-sm font-medium">{transaction.reason}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(transaction.createdAt)}
                            </div>
                          </div>
                          <Badge variant={transaction.amount > 0 ? "default" : "secondary"} 
                                 className={transaction.amount > 0 ? "bg-green-500/20 text-green-400" : ""}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No point transactions yet
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Back Button */}
        <div className="text-center">
          <Button asChild variant="outline" size="lg" className="border-green-500/20 hover:bg-green-500/10">
            <Link href="/leaderboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Leaderboard
            </Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}