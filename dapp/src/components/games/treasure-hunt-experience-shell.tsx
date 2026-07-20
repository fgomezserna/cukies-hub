'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  BookOpenText,
  Gamepad2,
  Medal,
  Swords,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const GAME_ROOT = '/games/treasure-hunt';

const tabs = [
  { href: GAME_ROOT, label: 'Jugar', Icon: Gamepad2 },
  { href: `${GAME_ROOT}/competitions`, label: 'Competiciones', Icon: Swords },
  { href: `${GAME_ROOT}/rankings`, label: 'Rankings', Icon: Medal },
  { href: `${GAME_ROOT}/rules`, label: 'Reglas', Icon: BookOpenText },
] as const;

function isCurrentTab(pathname: string, href: string) {
  return href === GAME_ROOT ? pathname === GAME_ROOT : pathname.startsWith(href);
}

export default function TreasureHuntExperienceShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isPlayRoute = pathname === GAME_ROOT;
  const contentViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appMain = document.querySelector<HTMLElement>('[data-app-main]');
    if (typeof appMain?.scrollTo === 'function') {
      appMain.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } else if (appMain) {
      appMain.scrollTop = 0;
      appMain.scrollLeft = 0;
    }

    const contentViewport = contentViewportRef.current;
    if (typeof contentViewport?.scrollTo === 'function') {
      contentViewport.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } else if (contentViewport) {
      contentViewport.scrollTop = 0;
      contentViewport.scrollLeft = 0;
    }
  }, [pathname]);

  return (
    <section
      data-treasure-hunt-shell
      data-treasure-hunt-view={isPlayRoute ? 'play' : 'information'}
      className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col overflow-hidden rounded-none border-0 bg-[#07110f]/80 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.9)] lg:h-auto lg:min-h-full lg:overflow-visible lg:rounded-[18px] lg:border lg:border-emerald-300/15"
    >
      <header className="relative z-40 shrink-0 overflow-hidden border-b border-emerald-300/15 bg-[#0b1714]/95 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[32rem] opacity-20 md:block">
          <Image
            src="/brand/generated/uki-treasure-hunt-scene-v2.png"
            alt=""
            fill
            sizes="512px"
            className="object-cover object-[50%_46%] [mask-image:linear-gradient(to_left,black,transparent)]"
            priority={isPlayRoute}
          />
        </div>

        <div className="relative flex min-h-[4.5rem] items-center gap-3 px-3 pr-[11.25rem] sm:px-5 sm:pr-52 lg:min-h-[5rem] lg:px-6 lg:pr-6">
          <Link
            href="/games"
            aria-label="Volver a todos los juegos"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-emerald-300/30 hover:bg-emerald-300/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-headline text-base font-black tracking-tight text-white sm:text-lg">
                Treasure Hunt
              </p>
              <span className="hidden rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 font-mono text-[0.6rem] font-black uppercase tracking-[0.12em] text-emerald-200 sm:inline-flex">
                Disponible
              </span>
            </div>
            <p className="truncate text-[0.68rem] font-medium text-slate-400 sm:text-xs">
              Cukies World · aventura y competición
            </p>
          </div>
        </div>

        <nav
          aria-label="Secciones de Treasure Hunt"
          className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max px-2 sm:px-4 lg:px-5">
            {tabs.map(({ href, label, Icon }) => {
              const active = isCurrentTab(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex min-h-12 items-center gap-2 px-3 text-xs font-black transition-colors sm:px-4 sm:text-sm',
                    active
                      ? 'text-emerald-200'
                      : 'text-slate-400 hover:text-slate-100',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{label}</span>
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div
        ref={contentViewportRef}
        data-treasure-hunt-content
        className={cn(
          'min-h-0 flex-1',
          isPlayRoute
            ? 'overflow-hidden lg:overflow-visible'
            : 'overflow-y-auto overscroll-y-contain',
        )}
      >
        <div
          className={cn(
            isPlayRoute && 'h-full min-h-0',
            !isPlayRoute && 'p-3 sm:p-5 lg:p-6',
          )}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
