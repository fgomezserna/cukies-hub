import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Logo from '@/components/icons/logo';

export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <div className="mr-4 flex items-center">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Logo />
            <span className="font-bold font-headline text-lg">HyppieLiquid</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <Link href="/games" className="text-muted-foreground transition-colors hover:text-foreground">
              Games
            </Link>
            <Link href="/leaderboard" className="text-muted-foreground transition-colors hover:text-foreground">
              Leaderboard
            </Link>
            <Link href="/quests" className="text-muted-foreground transition-colors hover:text-foreground">
              Quests
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <Button asChild>
            <Link href="/dashboard">Launch App</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
