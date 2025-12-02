import Link from 'next/link';
import Logo from '@/components/icons/logo';

export default function LandingFooter() {
  return (
    <footer className="border-t border-border/40 bg-card">
      <div className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Logo />
              <span className="font-bold font-headline">Cukies World</span>
            </div>
            <p className="text-muted-foreground text-sm">P2P betting on Hyperliquid.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-4 font-headline">Platform</h3>
            <ul className="space-y-2">
              <li><Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">Dashboard</Link></li>
              <li><Link href="/games" className="text-sm text-muted-foreground hover:text-foreground">Games</Link></li>
              <li><Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground">Leaderboard</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4 font-headline">Community</h3>
            <ul className="space-y-2">
              <li><Link href="https://x.com/cukiesworld" className="text-sm text-muted-foreground hover:text-foreground">Twitter</Link></li>
              <li><Link href="https://discord.gg/BxFxZZeAAj" className="text-sm text-muted-foreground hover:text-foreground">Discord</Link></li>
              <li><Link href="https://t.me/Cukies World" className="text-sm text-muted-foreground hover:text-foreground">Telegram</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4 font-headline">Legal</h3>
            <ul className="space-y-2">
              <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground">Terms of Service</Link></li>
              <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border/40 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Cukies World. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
