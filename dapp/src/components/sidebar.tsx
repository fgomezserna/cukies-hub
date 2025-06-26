import {
  Home,
  Gamepad2,
  Trophy,
  Users,
  Settings,
  Flame,
} from "lucide-react";
import { ClientLink } from "./client-link";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/games", icon: Gamepad2, label: "Games" },
  { href: "/quests", icon: Trophy, label: "Quests" },
  { href: "/referrals", icon: Users, label: "Referrals" },
];

export function Sidebar() {
  return (
    <aside className="hidden lg:flex h-full w-64 flex-col border-r border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="flex h-16 items-center border-b border-border/50 px-6">
        <ClientLink
          href="/"
          className="flex items-center gap-2 text-lg font-bold"
        >
          <Flame className="h-6 w-6 text-primary" />
          <span>Hyppie</span>
        </ClientLink>
      </div>
      <nav className="flex-1 space-y-2 p-4">
        {navItems.map((item) => (
          <ClientLink
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-primary hover:bg-accent"
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </ClientLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-border/50 p-4">
        <nav className="space-y-1">
          <ClientLink
            href="/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-primary hover:bg-accent"
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </ClientLink>
        </nav>
      </div>
    </aside>
  );
} 