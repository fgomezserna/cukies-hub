'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { Coins, Star, Users, TrendingUp } from "lucide-react";

export default function StatsCards() {
    const { user } = useAuth();

    const stats = [
        {
            title: 'My XP',
            value: user?.xp.toLocaleString() ?? '--',
            icon: Star,
            gradient: 'from-emerald-400 to-green-500',
            iconColor: 'text-white'
        },
        {
            title: 'My Rank',
            value: '#1,234',
            icon: TrendingUp,
            gradient: 'from-blue-400 to-cyan-500',
            iconColor: 'text-white'
        },
        {
            title: 'Total Players',
            value: '12,345',
            icon: Users,
            gradient: 'from-purple-400 to-pink-500',
            iconColor: 'text-white'
        },
        {
            title: 'Total Points',
            value: '1,234,567',
            icon: Coins,
            gradient: 'from-yellow-400 to-orange-500',
            iconColor: 'text-white'
        }
    ];

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
                <Card 
                    key={index} 
                    className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 hover:border-green-400/40"
                >
                    {/* Subtle background gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-5`} />
                    
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {stat.title}
                        </CardTitle>
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient} bg-opacity-10`}>
                            <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                        </div>
                    </CardHeader>
                    <CardContent className="relative">
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
