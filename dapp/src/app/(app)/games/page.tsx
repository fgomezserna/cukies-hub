import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Gamepad2, Trophy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Jugar | Cukies World',
  description: 'Elige un juego de Cukies World y empieza a jugar.',
};

const featuredGame = {
  name: 'Treasure Hunt',
  description: 'Explora, usa tus créditos para participar y compite por premios en cada periodo.',
  imageUrl: '/brand/generated/uki-treasure-hunt-scene-v2.png',
  href: '/games/treasure-hunt',
  rankingHref: '/games/treasure-hunt/rankings',
};

const otherGames = [
  {
    name: 'Cukies Brain Buzz',
    description: 'Pon a prueba tus conocimientos en una trivia rápida del universo Cukies.',
    imageUrl: '/portada_brain_buzz.jpg',
    href: 'https://brain-buzz.cukies.world/',
  },
  {
    name: "Cukies Rush n’ Run",
    description: 'Corre, esquiva obstáculos y llega tan lejos como puedas.',
    imageUrl: '/portada_jump_Hop.jpg',
    href: 'https://cukies.world/cukies-jump-n-hop/',
  },
  {
    name: 'Cukies Island',
    description: 'Descubre una aventura de exploración ambientada en el mundo Cukies.',
    imageUrl: '/portada_cukies_island.jpg',
    href: 'https://cukies-island.cukies.world/',
  },
] as const;

export default function GamesPage() {
  return (
    <div className="uki-landing mx-auto min-h-full w-full max-w-[1480px] bg-transparent pb-10 text-[var(--uki-cream)]">
      <header className="border-b border-white/10 pb-7 pt-1 sm:pb-9">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--uki-lilac)]">
          <Gamepad2 className="h-4 w-4" aria-hidden="true" />
          Juegos Cukies
        </p>
        <h1 className="mt-2 max-w-3xl text-balance font-headline text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[var(--uki-cream)] sm:text-5xl">
          Elige dónde quieres jugar
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:text-base">
          Empieza por Treasure Hunt para usar tus créditos y competir. También puedes entrar directamente en cualquiera de los otros mundos.
        </p>
      </header>

      <section aria-labelledby="featured-game-title" className="pt-7">
        <div className="grid overflow-hidden rounded-[20px] border border-[var(--uki-lilac)]/30 bg-[#09060f] shadow-[0_26px_80px_rgba(0,0,0,0.36)] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative min-h-[22rem] overflow-hidden lg:min-h-[34rem]">
            <Image src={featuredGame.imageUrl} alt="Escena de Treasure Hunt" fill priority sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09060f]/70 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-[#09060f]" />
          </div>

          <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--uki-lilac)]">Recomendado para empezar</p>
            <h2 id="featured-game-title" className="mt-3 font-headline text-4xl font-black leading-none text-[var(--uki-cream)] sm:text-5xl">{featuredGame.name}</h2>
            <p className="mt-4 text-base font-semibold leading-relaxed text-[var(--uki-text)]">{featuredGame.description}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={featuredGame.href} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[9px] bg-[var(--uki-lilac)] px-5 font-headline text-sm font-black uppercase tracking-[0.08em] text-[#09060f] transition hover:brightness-110">
                Jugar ahora
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href={featuredGame.rankingHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[9px] border border-white/15 bg-white/[0.04] px-5 font-headline text-sm font-black text-[var(--uki-cream)] transition hover:border-[var(--uki-lilac)]/50">
                <Trophy className="h-4 w-4 text-[var(--uki-lilac)]" aria-hidden="true" />
                Ver ranking
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="other-games-title" className="pt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--uki-lilac)]">Más mundos</p>
            <h2 id="other-games-title" className="mt-2 font-headline text-2xl font-black text-[var(--uki-cream)] sm:text-3xl">Sigue jugando</h2>
          </div>
          <p className="hidden text-sm font-semibold text-[var(--uki-muted)] sm:block">3 juegos disponibles</p>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {otherGames.map((game) => (
            <article key={game.name} className="group grid overflow-hidden rounded-[16px] border border-white/10 bg-black/25 sm:grid-cols-[12rem_1fr]">
              <div className="relative aspect-[4/3] overflow-hidden sm:aspect-auto sm:min-h-[14rem]">
                <Image src={game.imageUrl} alt={game.name} fill sizes="(min-width: 768px) 12rem, 100vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
              </div>
              <div className="flex min-w-0 flex-col justify-between p-5">
                <div>
                  <h3 className="font-headline text-2xl font-black text-[var(--uki-cream)]">{game.name}</h3>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{game.description}</p>
                </div>
                <a href={game.href} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-[var(--uki-lilac)]/45 bg-[var(--uki-lilac)]/10 px-4 text-sm font-black text-[var(--uki-cream)] transition hover:bg-[var(--uki-lilac)]/18 sm:w-fit">
                  Abrir juego
                  <ExternalLink className="h-4 w-4 text-[var(--uki-lilac)]" aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
