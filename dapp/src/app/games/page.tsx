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
import HyppieRoadImg from "@/assets/hyppie-road.png";
import ComingSoonImg from "@/assets/coming-soon.png";

const games = [
  { name: "Sybil Slayer", description: "Collect as fast as you can and don't get caught!", imageUrl: SybilSlayerImg, hint: "pixel art", live: false, playable: true, href: "/games/sybil-slayer" },
  { name: "Hyppie Road", description: "Navigate the crypto road, avoid traps, and multiply your rewards!", imageUrl: HyppieRoadImg, hint: "road adventure", live: false, playable: true, href: "/games/hyppie-road" },
  { name: "Hyper Runner", description: "Run, jump, and dodge obstacles in this fast-paced endless runner.", imageUrl: ComingSoonImg, hint: "endless runner", live: false, playable: false },
  { name: "Crypto Chess", description: "Outsmart your opponent in the classic game of strategy.", imageUrl: ComingSoonImg, hint: "chess board", live: true, playable: false }
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
        <div className="flex flex-col gap-6">
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
              🎮 Game Center
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Choose your favorite game and test your luck in our gaming ecosystem
            </p>
          </div>
          
          <div className="relative w-full max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-green-400" />
            <Input
              placeholder="🔍 Search games..."
              className="pl-12 py-3 rounded-xl border-2 border-green-500/20 bg-card/50 backdrop-blur-sm focus:border-green-400/50 focus:ring-2 focus:ring-green-400/20 transition-all duration-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredGames.map((game, index) => (
            <Card 
              key={game.name}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-500",
                game.playable
                  ? "border-green-500/20 bg-gradient-to-br from-card to-card/50 hover:border-green-400/40 hover:scale-105 hover:shadow-xl hover:shadow-green-500/20"
                  : "border-gray-500/20 bg-gradient-to-br from-card/50 to-card/30 cursor-not-allowed"
              )}
            >
              <CardHeader className="p-0 relative overflow-hidden">
                <Image 
                  src={game.imageUrl} 
                  alt={game.name} 
                  width={600} 
                  height={400} 
                  className={cn(
                    "object-cover h-52 transition-transform duration-500",
                    game.playable ? "group-hover:scale-110" : "grayscale"
                  )} 
                  data-ai-hint={game.hint} 
                />
                

                
                {/* Gradient overlay - only for playable games */}
                {game.playable && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                )}
                
                {/* Overlay for non-playable games */}
                {!game.playable && (
                  <div className="absolute top-0 left-0 right-0 h-52 bg-black/60 flex items-center justify-center z-10 !mt-0">
                    <span className="text-white font-bold text-lg bg-black/80 px-4 py-2 rounded-full">
                      🚧 Coming Soon
                    </span>
                  </div>
                )}
              </CardHeader>
              
              <CardContent className="pt-6 flex-grow space-y-3">
                <CardTitle className="font-headline text-xl text-foreground group-hover:text-primary transition-colors">
                  {game.name}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {game.description}
                </CardDescription>
              </CardContent>
              
              <CardFooter className="pt-2">
                {game.playable ? (
                  <Button 
                    asChild 
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/30"
                  >
                    <Link href={game.href!}>
                      🎮 Play Now
                    </Link>
                  </Button>
                ) : (
                  <Button 
                    disabled 
                    className="w-full bg-gray-600 text-gray-300 cursor-not-allowed py-3 rounded-xl"
                  >
                    ⏰ Coming Soon
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
