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
            icon: Star
        },
        {
            title: 'My Rank',
            value: '#1,234',
            icon: TrendingUp
        },
        {
            title: 'Total Players',
            value: '12,345',
            icon: Users
        },
        {
            title: 'Total Points',
            value: '1,234,567',
            icon: Coins
        }
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
                <Card key={index}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                        <stat.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stat.value}</div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
