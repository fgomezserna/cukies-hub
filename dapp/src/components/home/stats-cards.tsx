'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { Coins, Star, Users, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

interface PlatformStats {
    totalUsers: number;
    totalSessions: number;
    totalXpDistributed: number;
    userStats?: {
        totalXp: number;
        referralRewards: number;
        rank: number;
        totalSessions: number;
    };
}

export default function StatsCards() {
    const { user } = useAuth();
    const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const params = new URLSearchParams();
                if (user?.id) {
                    params.append('userId', user.id);
                }
                
                const response = await fetch(`/api/games/stats?${params}`);
                if (response.ok) {
                    const data = await response.json();
                    setPlatformStats(data);
                }
            } catch (error) {
                console.error('Failed to fetch platform stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user]);

    const stats = [
        {
            title: 'My XP',
            value: loading ? '--' : (user?.xp.toLocaleString() ?? '--'),
            icon: Star,
            gradient: 'from-pink-500 to-pink-600',
            iconColor: 'text-white',
            backgroundImage: '/my_xp.jpg'
        },
        {
            title: 'My Rank',
            value: loading ? '--' : (platformStats?.userStats?.rank ? `#${platformStats.userStats.rank.toLocaleString()}` : '--'),
            icon: TrendingUp,
            gradient: 'from-blue-400 to-cyan-500',
            iconColor: 'text-white',
            backgroundImage: '/my_rank.jpg'
        },
        {
            title: 'Total Players',
            value: loading ? '--' : (platformStats?.totalUsers.toLocaleString() ?? '--'),
            icon: Users,
            gradient: 'from-purple-400 to-pink-500',
            iconColor: 'text-white',
            backgroundImage: '/total_players.jpg'
        },
        {
            title: 'Total XP',
            value: loading ? '--' : (platformStats?.totalXpDistributed.toLocaleString() ?? '--'),
            icon: Coins,
            gradient: 'from-yellow-400 to-orange-500',
            iconColor: 'text-white',
            backgroundImage: '/total_xp.jpg'
        }
    ];

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
                <Card 
                    key={index} 
                    className="relative overflow-hidden border border-pink-600/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 hover:border-pink-500/40"
                >
                    {/* Background Image with filters */}
                    <div className="absolute inset-0 z-0">
                        <Image 
                            src={stat.backgroundImage}
                            alt=""
                            fill
                            className="object-cover grayscale opacity-20"
                            style={{ filter: 'blur(2px)' }}
                        />
                    </div>
                    
                    {/* Subtle background gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-5 z-10`} />
                    
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-20">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {stat.title}
                        </CardTitle>
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient} bg-opacity-10`}>
                            <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                        </div>
                    </CardHeader>
                    <CardContent className="relative z-20">
                        <div className="text-3xl font-bold font-headline text-foreground">
                            {stat.value}
                        </div>
                        {/* Glow effect */}
                        <div className="absolute -bottom-1 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
