import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Gamepad2 } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import StatsCards from '@/components/home/stats-cards';
import SybilSlayerImg from "@/assets/sybilslash.png";
import HyppieRoadImg from "@/assets/hyppie-road.png";
import ComingSoonImg from "@/assets/coming-soon.png";

const games = [
  { name: "Sybil Slayer", description: "Collect as fast as you can and don't get caught!", imageUrl: SybilSlayerImg, hint: "pixel art", live: false, playable: true, href: "/games/sybil-slayer" },
  { name: "Hyppie Road", description: "Navigate the crypto road, avoid traps, and multiply your rewards!", imageUrl: HyppieRoadImg, hint: "road adventure", live: false, playable: true, href: "/games/hyppie-road" },
  { name: "Hyper Runner", description: "Run, jump, and dodge obstacles in this fast-paced endless runner.", imageUrl: ComingSoonImg, hint: "endless runner", live: false, playable: false },
  { name: "Crypto Chess", description: "Outsmart your opponent in the classic game of strategy.", imageUrl: ComingSoonImg, hint: "chess board", live: true, playable: false }
];
const featuredGame = games[0];
const otherGames = games.slice(1);

export default function HomePage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <Card className="overflow-hidden relative border-2 border-green-500/30 shadow-2xl shadow-green-500/20 rounded-3xl group">
          {/* Background image with overlay */}
          <Image 
            src={featuredGame.imageUrl} 
            alt={featuredGame.name} 
            width={600} 
            height={400} 
            className="object-cover w-full h-[450px] transition-transform duration-700 group-hover:scale-110" 
            data-ai-hint={featuredGame.hint} 
          />
          
          {/* Multiple overlay gradients for better effect */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-green-900/40 via-transparent to-blue-900/40" />
          
          {/* Animated glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 transform translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
          
          <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12">
            {/* Game badge */}
            <div className="mb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg">
                🎮 Featured Game
              </span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-headline tracking-tighter text-white drop-shadow-lg">
              {featuredGame.name}
            </h1>
            <p className="mt-3 max-w-lg text-lg text-gray-200 drop-shadow-sm">
              {featuredGame.description}
            </p>
            
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Button 
                asChild 
                size="lg" 
                className="bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white font-bold py-4 px-8 rounded-xl shadow-xl shadow-green-500/30 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/40 border-0"
              >
                <Link href={featuredGame.href!}>
                  🚀 Play Now! <Gamepad2 className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              
              <Button 
                asChild 
                variant="outline" 
                size="lg"
                className="border-2 border-white/30 bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 hover:border-white/50 transition-all duration-300"
              >
                <Link href="/leaderboard">
                  📊 View Stats
                </Link>
              </Button>
            </div>
          </div>
          
          {/* Corner decoration */}
          <div className="absolute top-4 right-4 w-16 h-16 border-t-2 border-r-2 border-green-400/50 rounded-tr-lg" />
          <div className="absolute bottom-4 left-4 w-16 h-16 border-b-2 border-l-2 border-green-400/50 rounded-bl-lg" />
        </Card>
        
        <StatsCards />

        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold font-headline text-foreground">
              🎲 More Games
            </h2>
            <p className="mt-2 text-lg text-muted-foreground">
              Discover more unique gaming experiences
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {otherGames.map((game, index) => (
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
                        "object-cover h-48 transition-transform duration-500",
                        game.playable ? "group-hover:scale-110" : "grayscale"
                      )} 
                      data-ai-hint={game.hint} 
                    />
                    
                    {/* Overlay for non-playable games */}
                    {!game.playable && (
                      <div className="absolute top-0 left-0 right-0 h-48 bg-black/60 flex items-center justify-center z-10 !mt-0">
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
                        <Link href="/games">
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
      </div>
    </AppLayout>
  )
}
