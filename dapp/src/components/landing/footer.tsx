'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePublicLocale } from '@/providers/public-locale-provider';

const footerCopy = {
  es: {
    home: 'Inicio',
    rewards: 'Premios',
    rights: 'Todos los derechos reservados.',
  },
  en: {
    home: 'Home',
    rewards: 'Rewards',
    rights: 'All rights reserved.',
  },
} as const;

export function LandingFooter() {
  const { locale } = usePublicLocale();
  const copy = footerCopy[locale];

  return (
    <footer className="uki-footer">
      <div className="uki-footer-inner uki-container">
        <div className="uki-footer-brand">
          <span className="relative block h-11 w-[6.8rem] overflow-hidden sm:h-12 sm:w-[7.4rem]">
            <Image src="/Cukie_logo_first.png" alt="Cukies World" fill className="object-contain object-left" sizes="7.4rem" />
          </span>
        </div>

        {/* Redes Sociales con SVGs Inline Premiums */}
        <div className="uki-footer-socials">
          {/* X / Twitter */}
          <a
            href="https://x.com/cukiesworld"
            target="_blank"
            rel="noreferrer"
            aria-label="X (Twitter)"
            className="uki-social-link"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>

          {/* Discord */}
          <a
            href="https://discord.gg/cukiesworld"
            target="_blank"
            rel="noreferrer"
            aria-label="Discord"
            className="uki-social-link"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 127.14 96.36">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.4-5c.87-.64,1.71-1.32,2.51-2a75.76,75.76,0,0,0,72.72,0c.8,0.68,1.64,1.36,2.51,2a68.43,68.43,0,0,1-10.4,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,32.58-18.83C129,54.65,122.94,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
            </svg>
          </a>

          {/* Telegram */}
          <a
            href="https://t.me/cukiesworld"
            target="_blank"
            rel="noreferrer"
            aria-label="Telegram"
            className="uki-social-link"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.24-5.54 3.65-.52.36-.97.54-1.34.53-.41-.01-1.21-.23-1.8-.42-.72-.24-1.3-.37-1.25-.79.03-.22.3-.44.82-.67 3.2-1.39 5.33-2.31 6.4-2.75 3.05-1.25 3.68-1.47 4.1-.15z" />
            </svg>
          </a>
        </div>

        <div className="uki-footer-links">
          <Link href="/" className="hover:text-[var(--uki-cyan)]">{copy.home}</Link>
          <Link href="/premios" className="hover:text-[var(--uki-cyan)]">{copy.rewards}</Link>
        </div>

        <p className="uki-footer-copy">
          © 2026 Cukies World
          <span className="block">{copy.rights}</span>
        </p>
      </div>
    </footer>
  );
}
