import { ConnectWallet } from "@/components/connect-wallet";
import { ModeToggle } from "@/components/mode-toggle";

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b px-4">
      <div>{/* Placeholder for breadcrumbs or page title */}</div>
      <div className="flex items-center gap-4">
        <ModeToggle />
        <ConnectWallet />
      </div>
    </header>
  );
} 