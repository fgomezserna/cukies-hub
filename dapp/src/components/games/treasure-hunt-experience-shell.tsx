'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import Header from '@/components/layout/header';
import { cn } from '@/lib/utils';

const GAME_ROOT = '/games/treasure-hunt';

const tabs = [
  { href: GAME_ROOT, label: 'Jugar' },
  { href: `${GAME_ROOT}/competitions`, label: 'Competiciones' },
  { href: `${GAME_ROOT}/rankings`, label: 'Rankings' },
  { href: `${GAME_ROOT}/rules`, label: 'Reglas' },
] as const;

function isCurrentTab(pathname: string, href: string) {
  return href === GAME_ROOT ? pathname === GAME_ROOT : pathname.startsWith(href);
}

export default function TreasureHuntExperienceShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const contentViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = contentViewportRef.current;
    if (typeof viewport?.scrollTo === 'function') {
      viewport.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } else if (viewport) {
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
    }
  }, [pathname]);

  return (
    <section
      data-treasure-hunt-shell
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#030c0c] text-[#f2eee7]"
    >
      <header className="relative z-40 shrink-0 border-b border-[#2ce8dc]/20 bg-[#030c0c]/95">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <Image
            src="/brand/generated/uki-treasure-hunt-reference-scene.png"
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-[70%_48%] opacity-[0.09] [mask-image:linear-gradient(to_left,black,transparent_72%)]"
            priority
          />
        </div>

        <div className="relative mx-auto w-full max-w-[1340px] px-4 pb-4 pt-4 sm:px-7 lg:px-8 lg:pb-5">
          <p className="text-xs font-medium text-[#aaa8a2] sm:text-sm">
            <Link href="/games" className="transition hover:text-[#37eee2]">Juegos</Link>
            <span className="mx-3 text-[#6f7470]">/</span>
            <span className="text-[#37eee2]">Treasure Hunt</span>
          </p>

          <div className="mt-3 flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[14px] border border-[#bd8f32]/25 bg-[#10201c] shadow-[inset_0_0_24px_rgba(210,159,55,0.12)] sm:h-[74px] sm:w-[74px]">
              <Image
                src="/brand/official/uki-token-cukies-world-coin.png"
                alt=""
                fill
                sizes="74px"
                className="object-contain p-1.5"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-headline text-2xl font-black tracking-[-0.03em] text-[#f3efe7] sm:text-3xl lg:text-[2.2rem]">
                  Treasure Hunt
                </h1>
                <span className="inline-flex items-center gap-2 rounded-[5px] border border-[#29c894]/30 bg-[#0b1c17] px-2.5 py-1 text-xs font-semibold text-[#61e598]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#61e598]" />
                  Disponible
                </span>
              </div>
              <p className="mt-1.5 max-w-[44rem] truncate text-xs text-[#aaa8a2] sm:text-sm">
                Encuentra tesoros, completa el tótem y compite en distintos desafíos.
              </p>
            </div>
          </div>

          <div className="absolute right-4 top-3 sm:right-7 lg:right-8">
            <Header variant="game-overlay" />
          </div>
        </div>

        <nav
          aria-label="Secciones de Treasure Hunt"
          className="border-t border-[#2ce8dc]/16 bg-[#071312]/88"
        >
          <div className="mx-auto flex min-w-max max-w-[1340px] overflow-x-auto px-3 sm:px-6 lg:px-8">
            {tabs.map(({ href, label }) => {
              const active = isCurrentTab(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex min-h-[46px] min-w-[5.75rem] items-center justify-center border-r border-[#d9e4df]/10 px-3 text-xs font-semibold transition-colors first:border-l sm:min-w-[10rem] sm:px-5 sm:text-sm',
                    active
                      ? 'text-[#35eee2]'
                      : 'text-[#aaa8a2] hover:text-[#f3efe7]',
                  )}
                >
                  {label}
                  {active ? (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#35eee2] shadow-[0_0_12px_rgba(53,238,226,0.55)]" />
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
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
      >
        <div className="mx-auto min-h-full w-full max-w-[1340px] px-4 py-5 sm:px-7 sm:py-6 lg:px-8">
          {children}
        </div>
      </div>
    </section>
  );
}
