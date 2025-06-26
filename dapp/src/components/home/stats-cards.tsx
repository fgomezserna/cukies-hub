'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { ArrowUpRight, Gamepad2, Trophy, Users } from "lucide-react";
import Link from "next/link";

export default function StatsCards() {
    const { user } = useAuth();

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Registered Players</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-2">12,456</div>
              <p className="text-xs text-muted-foreground">+1,230 this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Matches Played</CardTitle>
              <Gamepad2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-3">1.2M</div>
              <p className="text-xs text-muted-foreground">Across all games</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Points Distributed</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-4">25.6M XP</div>
              <p className="text-xs text-muted-foreground">Experience points earned</p>
            </CardContent>
          </Card>
           <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Score of the Day</CardTitle>
              <Trophy className="h-4 w-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-3">250,321</div>
              <p className="text-xs text-muted-foreground">
                by {user ? (
                    <Link href="/profile/SybilSlayerPro" className="hover:underline">SybilSlayerPro</Link>
                ) : (
                    'SybilSlayerPro'
                )}
                </p>
            </CardContent>
          </Card>
        </div>
    )
}
