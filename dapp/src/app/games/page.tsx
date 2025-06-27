'use client';

import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import Image from "next/image";
import Link from 'next/link';
import { cn } from '@/lib/utils';
import SybilSlayerImg from "@/assets/sybilslash.png";

const games = [
  { name: "Sybil Slayer", description: "Collect as fast as you can and don't get caught!", imageUrl: SybilSlayerImg, hint: "pixel art", live: false, playable: true, href: "/games/sybil-slayer" },
  { name: "Hyper Runner", description: "Run, jump, and dodge obstacles in this fast-paced endless runner.", imageUrl: "https://images.unsplash.com/photo-1498084393753-b411b2d26b34?w=600&h=400&fit=crop", hint: "endless runner", live: false, playable: false },
  { name: "Crypto Chess", description: "Outsmart your opponent in the classic game of strategy.", imageUrl: "https://images.unsplash.com/photo-1695480542225-bc22cac128d0?w=600&h=400&fit=crop", hint: "chess board", live: true, playable: false }
];

export default function GamesPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGames = useMemo(() => {
    return games.filter(game =>
      game.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold font-headline">Games</h1>
            <p className="text-muted-foreground">Choose your game and test your luck.</p>
          </div>
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search games..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => (
            <Card 
              key={game.name}
              className={cn(
                "flex flex-col overflow-hidden transition-all duration-300",
                game.playable
                  ? "hover:shadow-lg hover:shadow-primary/20 hover:scale-105"
                  : "cursor-not-allowed"
              )}
            >
              <CardHeader className="p-0 relative">
                <Image src={game.imageUrl} alt={game.name} width={600} height={400} className="object-cover" data-ai-hint={game.hint} />
                {!game.playable && (
                  <div className="absolute inset-0 bg-black/50 mix-blend-multiply z-10" />
                )}
                {game.live && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-xs font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>
                    LIVE
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-6 flex-grow">
                <CardTitle className="font-headline text-xl">{game.name}</CardTitle>
                <CardDescription className="mt-2">{game.description}</CardDescription>
              </CardContent>
              <CardFooter>
                {game.playable ? (
                  <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                    <Link href={game.href!}>Play Now</Link>
                  </Button>
                ) : (
                  <Button disabled className="w-full cursor-not-allowed">Coming soon</Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
