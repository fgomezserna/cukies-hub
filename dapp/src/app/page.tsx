import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Gamepad2 } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import StatsCards from '@/components/home/stats-cards';

const games = [
  { name: "Sybil Slayer", description: "Collect as fast as you can and don't get caught!", imageUrl: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=600&h=400&fit=crop", hint: "pixel art", live: false, playable: true, href: "/games/sybil-slayer" },
  { name: "Hyper Runner", description: "Run, jump, and dodge obstacles in this fast-paced endless runner.", imageUrl: "https://images.unsplash.com/photo-1498084393753-b411b2d26b34?w=600&h=400&fit=crop", hint: "endless runner", live: false, playable: false },
  { name: "Crypto Chess", description: "Outsmart your opponent in the classic game of strategy.", imageUrl: "https://images.unsplash.com/photo-1695480542225-bc22cac128d0?w=600&h=400&fit=crop", hint: "chess board", live: true, playable: false }
];
const featuredGame = games[0];
const otherGames = games.slice(1);

export default function HomePage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <Card className="overflow-hidden relative border-2 border-primary/50 shadow-2xl shadow-primary/20">
          <Image src={featuredGame.imageUrl} alt={featuredGame.name} width={600} height={400} className="object-cover w-full h-[400px] opacity-20" data-ai-hint={featuredGame.hint} />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12">
            <h1 className="text-4xl md:text-6xl font-bold font-headline tracking-tighter text-white">
              {featuredGame.name}
            </h1>
            <p className="mt-2 max-w-lg text-lg text-muted-foreground">
              {featuredGame.description}
            </p>
            <div className="mt-6">
              <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-105">
                <Link href={featuredGame.href!}>
                  Play Now <Gamepad2 className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
        
        <StatsCards />

        <div>
          <h2 className="text-2xl font-bold font-headline">More Games</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            {otherGames.map((game) => (
                <Card 
                  key={game.name}
                  className={cn(
                    "flex flex-col overflow-hidden transition-all duration-300",
                    !game.playable && "cursor-not-allowed"
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
                        <Link href="/games">Play Now</Link>
                    </Button>
                  ) : (
                    <Button disabled className="w-full cursor-not-allowed">Coming soon</Button>
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
