'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Gamepad2, Search } from 'lucide-react';
import Image from "next/image";
import Link from 'next/link';
import { cn } from '@/lib/utils';

const games = [
  { name: "Treasure Hunt", description: "Primer juego conectado a UKI: usa créditos, valida score y compite por periodo.", imageUrl: "/brand/generated/uki-treasure-hunt-scene-v2.png", hint: "treasure hunt", live: false, playable: true, href: "/games/sybil-slayer" },
  { name: "Cukies Brain Buzz", description: "Trivia competitiva para ampliar el universo de juegos Cukies.", imageUrl: "/portada_brain_buzz.jpg", hint: "trivia", live: false, playable: true, href: "https://brain-buzz.cukies.world/" },
  { name: "Cukies Rush n' Run", description: "Runner de acción dentro del ecosistema Cukies.", imageUrl: "/portada_jump_Hop.jpg", hint: "platformer", live: false, playable: true, href: "https://cukies.world/cukies-jump-n-hop/" },
  { name: "Cukies Island", description: "Aventura de mundo para futuras experiencias de la economía Cukies.", imageUrl: "/portada_cukies_island.jpg", hint: "island adventure", live: false, playable: true, href: "https://cukies-island.cukies.world/" }
];

export default function GamesPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGames = useMemo(() => {
    return games.filter(game =>
      game.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold font-headline text-cyan-200">
              Juegos / Jugar
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Treasure Hunt es el primer juego conectado a UKI. El resto de mundos se presenta como expansión futura del ecosistema.
            </p>
          </div>
          
          <div className="relative w-full max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-pink-500" />
            <Input
              placeholder="Buscar juegos..."
              className="pl-12 py-3 rounded-xl border-2 border-pink-600/20 bg-card/50 backdrop-blur-sm focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/20 transition-all duration-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredGames.map((game) => (
            <Card 
              key={game.name}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-500",
                game.playable
                  ? "border-pink-600/20 bg-gradient-to-br from-card to-card/50 hover:border-pink-500/40 hover:scale-105 hover:shadow-xl hover:shadow-pink-600/20"
                  : "border-gray-500/20 bg-gradient-to-br from-card/50 to-card/30 cursor-not-allowed"
              )}
            >
              <CardHeader className="relative aspect-[4/3] overflow-hidden p-0">
                <Image 
                  src={game.imageUrl} 
                  alt={game.name} 
                  fill
                  sizes="(min-width: 1024px) 31vw, (min-width: 768px) 45vw, 100vw"
                  priority
                  className={cn(
                    "object-cover transition-transform duration-500",
                    game.playable ? "group-hover:scale-110" : "grayscale"
                  )} 
                  data-ai-hint={game.hint} 
                />
                

                
                {game.playable && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                )}
                
                {!game.playable && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 !mt-0">
                    <span className="text-white font-bold text-lg bg-black/80 px-4 py-2 rounded-full">
                      Próximamente
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
                    className="w-full bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white font-bold py-3 rounded-xl shadow-lg shadow-pink-600/20 transition-all duration-300 hover:shadow-xl hover:shadow-pink-600/30"
                  >
                    {game.href?.startsWith('http://') || game.href?.startsWith('https://') ? (
                      <a href={game.href} target="_blank" rel="noopener noreferrer">
                        <Gamepad2 className="mr-2 h-4 w-4" />
                        Jugar
                      </a>
                    ) : (
                      <Link href={game.href!}>
                        <Gamepad2 className="mr-2 h-4 w-4" />
                        Jugar
                      </Link>
                    )}
                  </Button>
                ) : (
                  <Button 
                    disabled 
                    className="w-full bg-gray-600 text-gray-300 cursor-not-allowed py-3 rounded-xl"
                  >
                    Próximamente
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
  )
}
