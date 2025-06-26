import { DailyCheckin } from "@/components/daily-checkin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { ClientLink } from "@/components/client-link";
import { cn } from "@/lib/utils";

// Add highlight property to differentiate card styles
const featuredGames = [
  {
    title: "Sybil Slayer",
    description:
      "Defeat the sybils and save the network in this action-packed adventure.",
    imageUrl: "/globe.svg",
    href: "/games/sybil-slayer",
    highlight: "primary",
  },
  {
    title: "Cosmic Drift",
    description:
      "Race through asteroid fields in a high-stakes cosmic challenge.",
    imageUrl: "/globe.svg",
    href: "#",
    highlight: "secondary",
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-primary from-30% to-primary/60 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Your central hub for web3 gaming, quests, and rewards.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-8">
          <Card className="bg-transparent border-0 shadow-none">
            <CardHeader>
              <CardTitle>Featured Games</CardTitle>
              <CardDescription>
                Check out the latest and greatest games on the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              {featuredGames.map((game, index) => (
                <Card
                  key={index}
                  className={cn(
                    "group overflow-hidden bg-gradient-to-b from-card to-card/90 backdrop-blur-sm border border-border/50 transition-all hover:scale-[1.02]",
                    {
                      "hover:border-primary/80 hover:shadow-lg hover:shadow-primary/20":
                        game.highlight === "primary",
                      "hover:border-secondary/80 hover:shadow-lg hover:shadow-secondary/20":
                        game.highlight === "secondary",
                    }
                  )}
                >
                  <div className="overflow-hidden">
                    <Image
                      src={game.imageUrl}
                      alt={game.title}
                      width={400}
                      height={225}
                      className="w-full h-36 object-cover bg-muted group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-semibold">{game.title}</h3>
                    <p className="text-muted-foreground text-sm mt-1 h-10">
                      {game.description}
                    </p>
                    <Button asChild className="mt-4 w-full">
                      <ClientLink href={game.href}>
                        {game.href === "#" ? "Coming Soon" : "Play Now"}
                      </ClientLink>
                    </Button>
                  </div>
                </Card>
              ))}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-8">
          <DailyCheckin />
        </aside>
      </div>
    </div>
  );
}
