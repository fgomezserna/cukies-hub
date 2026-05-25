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
            <p className="text-muted-foreground text-sm">Economía de juegos conectada a UKI.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-4 font-headline">Plataforma</h3>
            <ul className="space-y-2">
              <li><Link href="/wallet" className="text-sm text-muted-foreground hover:text-foreground">Wallet</Link></li>
              <li><Link href="/games" className="text-sm text-muted-foreground hover:text-foreground">Juegos</Link></li>
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
              <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground">Términos</Link></li>
              <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground">Privacidad</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border/40 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Cukies World. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
