import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

export default function GamesPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Games</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sybil Slayer</CardTitle>
            <CardDescription>A fun card game to slay sybils.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Placeholder for game image */}
            <div className="aspect-video bg-secondary rounded-md flex items-center justify-center">
              <p>Game Image</p>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/games/sybil-slayer" className="w-full">
              <Button className="w-full">Play</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
} 