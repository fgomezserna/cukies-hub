import { ConnectWallet } from "@/components/connect-wallet";
import { ModeToggle } from "@/components/mode-toggle";

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-end border-b border-border/50 bg-background px-6">
      <div className="flex items-center gap-4">
        <ModeToggle />
        <ConnectWallet />
      </div>
    </header>
  );
} 