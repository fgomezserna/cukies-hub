import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientLink } from "@/components/client-link";
import Image from "next/image";
import { cn } from "@/lib/utils";

const games = [
  {
    title: "Sybil Slayer",
    description: "A fun and engaging game where you eliminate sybils.",
    imageUrl: "/globe.svg",
    href: "/games/sybil-slayer",
    status: "live",
    highlight: "primary",
  },
  {
    title: "Cosmic Drift",
    description: "Navigate treacherous asteroid fields in this space racer.",
    imageUrl: "/globe.svg",
    href: "#",
    status: "coming_soon",
    highlight: "secondary",
  },
  {
    title: "DeFi Kingdom",
    description: "Manage your kingdom and conquer the DeFi world.",
    imageUrl: "/globe.svg",
    href: "#",
    status: "coming_soon",
    highlight: "primary",
  },
];

export default function GamesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-primary from-30% to-primary/60 bg-clip-text text-transparent">
          Game Center
        </h1>
        <p className="text-muted-foreground mt-1">
          Explore our collection of web3 games. New challenges await.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game) => (
          <Card
            key={game.title}
            className={cn(
              "group overflow-hidden bg-gradient-to-b from-card to-card/90 backdrop-blur-sm border border-border/50 transition-all hover:scale-[1.02] flex flex-col",
              {
                "hover:border-primary/80 hover:shadow-lg hover:shadow-primary/20":
                  game.highlight === "primary",
                "hover:border-secondary/80 hover:shadow-lg hover:shadow-secondary/20":
                  game.highlight === "secondary",
              }
            )}
          >
            <CardHeader>
              <CardTitle>{game.title}</CardTitle>
              <CardDescription className="h-10">
                {game.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="aspect-video relative">
                <Image
                  src={game.imageUrl}
                  alt={game.title}
                  fill
                  className="object-cover rounded-md bg-muted group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </CardContent>
            <div className="p-4 pt-0">
              <Button asChild className="w-full">
                <ClientLink href={game.href}>
                  {game.status === "live" ? "Play Now" : "Coming Soon"}
                </ClientLink>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
} 