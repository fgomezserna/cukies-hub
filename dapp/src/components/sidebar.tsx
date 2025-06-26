import Link from "next/link";
import { User, Settings, LogOut } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="text-lg font-bold">
          Hyppie Gambling
        </Link>
      </div>
      <nav className="flex flex-col p-4 space-y-1">
        <Link href="/games" className="rounded-md p-2 hover:bg-accent flex items-center">
          Games
        </Link>
        <Link href="/quests" className="rounded-md p-2 hover:bg-accent flex items-center">
          Quests
        </Link>
        <Link href="/referrals" className="rounded-md p-2 hover:bg-accent flex items-center">
          Referrals
        </Link>
        <Link href="/leaderboard" className="rounded-md p-2 hover:bg-accent flex items-center">
          Leaderboard
        </Link>
      </nav>
      <div className="mt-auto p-4 border-t">
        <nav className="space-y-1">
          <Link href="/settings" className="rounded-md p-2 hover:bg-accent flex items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </nav>
      </div>
    </aside>
  );
} 