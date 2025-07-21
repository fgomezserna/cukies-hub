'use client';

import AppLayout from '@/components/layout/app-layout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Gamepad2, Medal, TrendingUp, BarChart } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';

// Mock data for users
const userProfiles: Record<string, any> = {
    'You': {
        name: 'You',
        avatar: 'https://placehold.co/100x100.png',
        hint: 'profile avatar',
        joined: '2024-07-01',
        rank: 'Bronze',
        bio: 'Conquering the crypto world, one game at a time. 🚀',
        stats: {
            matchesPlayed: 128,
            winRate: '62%',
            avgScore: 89_450,
            favoriteGame: 'Sybil Slayer'
        },
        recentActivity: [
            { game: 'Sybil Slayer', score: 135600, date: '2024-07-30' },
            { game: 'Sybil Slayer', score: 98000, date: '2024-07-29' },
        ]
    },
    'SybilSlayerPro': {
        name: 'SybilSlayerPro',
        avatar: 'https://placehold.co/100x100.png',
        hint: 'pro gamer',
        joined: '2024-05-15',
        rank: 'Gold',
        bio: 'Top of the leaderboard. Can you beat me?',
        stats: {
            matchesPlayed: 543,
            winRate: '88%',
            avgScore: 145_200,
            favoriteGame: 'Sybil Slayer'
        },
        recentActivity: [
            { game: 'Sybil Slayer', score: 250321, date: '2024-07-30' },
            { game: 'Sybil Slayer', score: 195000, date: '2024-07-29' },
        ]
    },
    'GemHunter': {
        name: 'GemHunter',
        avatar: 'https://placehold.co/100x100.png',
        hint: 'gem stone',
        joined: '2024-06-20',
        rank: 'Silver',
        bio: 'Hunting for the rarest gems and biggest wins.',
        stats: {
            matchesPlayed: 210,
            winRate: '71%',
            avgScore: 110_500,
            favoriteGame: 'Sybil Slayer'
        },
        recentActivity: [
            { game: 'Sybil Slayer', score: 148970, date: '2024-07-28' },
        ]
    }
};
// Add other users from leaderboards for completeness
['TokenRunner', 'ChainMaster', 'PixelPioneer'].forEach(name => {
    userProfiles[name] = {
        name,
        avatar: 'https://placehold.co/100x100.png',
        hint: 'gamer avatar',
        joined: '2024-07-10',
        rank: 'Bronze',
        bio: 'Just here to have fun and win big!',
        stats: {
            matchesPlayed: Math.floor(Math.random() * 100) + 50,
            winRate: `${Math.floor(Math.random() * 30) + 50}%`,
            avgScore: Math.floor(Math.random() * 50000) + 70000,
            favoriteGame: 'Sybil Slayer'
        },
        recentActivity: []
    };
});

type UserProfile = typeof userProfiles['You'];

export default function ProfilePage() {
    const params = useParams();
    const username = params.username as string;

    const user: UserProfile | null = useMemo(() => {
        // In a real app, you'd fetch this data
        return userProfiles[username as keyof typeof userProfiles] || null;
    }, [username]);

    if (!user) {
        return (
            <AppLayout>
                <div className="text-center">
                    <h1 className="text-4xl font-bold">User not found</h1>
                    <p className="text-muted-foreground mt-2">The profile for "{username}" could not be located.</p>
                </div>
            </AppLayout>
        )
    }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Profile Header */}
        <Card>
            <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-6">
                <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-primary">
                    <AvatarImage src={user.avatar} data-ai-hint={user.hint} />
                    <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="text-center sm:text-left">
                    <h1 className="text-3xl font-bold font-headline">{user.name}</h1>
                    <p className="text-muted-foreground mt-1">Joined {user.joined}</p>
                    <p className="mt-4 text-foreground max-w-prose">{user.bio}</p>
                </div>
                <Badge variant="outline" className="ml-auto text-lg px-4 py-2 hidden lg:flex items-center gap-2">
                    <Medal className="h-5 w-5 text-yellow-500" />
                    {user.rank} Tier
                </Badge>
            </CardContent>
        </Card>

        {/* Stats */}
        <div>
            <h2 className="text-2xl font-bold font-headline mb-4">Player Stats</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Matches Played</CardTitle>
                        <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{user.stats.matchesPlayed}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{user.stats.winRate}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                        <BarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{user.stats.avgScore.toLocaleString()}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Favorite Game</CardTitle>
                        <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{user.stats.favoriteGame}</div>
                    </CardContent>
                </Card>
            </div>
        </div>

        {/* Recent Activity */}
        <div>
            <h2 className="text-2xl font-bold font-headline mb-4">Recent Activity</h2>
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Game</TableHead>
                                <TableHead>Score</TableHead>
                                <TableHead className="text-right">Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {user.recentActivity.length > 0 ? user.recentActivity.map((activity: any, index: number) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{activity.game}</TableCell>
                                    <TableCell className="font-mono text-primary">{activity.score.toLocaleString()}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{activity.date}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                                        No recent activity to display.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </div>
    </AppLayout>
  );
}
