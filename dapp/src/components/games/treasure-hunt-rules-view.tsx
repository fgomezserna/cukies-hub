'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Gamepad2, Trophy } from 'lucide-react';

function RuleSection({
  number,
  title,
  summary,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly summary: string;
  readonly children: ReactNode;
}) {
  return (
    <li className="grid gap-4 px-5 py-6 sm:grid-cols-[3rem_minmax(0,1fr)] sm:px-7 sm:py-7">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--uki-lilac-border-strong)] bg-[var(--uki-lilac-soft)] font-mono text-sm font-black tabular-nums text-[var(--uki-lilac)]">
        {String(number).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <h3 className="text-balance font-headline text-xl font-black tracking-[-0.02em] text-[var(--uki-cream)]">
          {title}
        </h3>
        <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
          {summary}
        </p>
        <div className="mt-4 space-y-4 text-sm font-semibold leading-6 text-[var(--uki-text)]">
          {children}
        </div>
      </div>
    </li>
  );
}

function SourceCard({
  title,
  badge,
  children,
}: {
  readonly title: string;
  readonly badge: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <p className="text-[11px] font-black tracking-[0.08em] text-[var(--uki-lilac)]">{badge}</p>
      <h4 className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">{title}</h4>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--uki-text)]">{children}</div>
    </section>
  );
}

export default function TreasureHuntRulesView() {
  return (
    <div className="mx-auto min-h-full w-full max-w-[72rem] pb-10">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.08em] text-[var(--uki-lilac)]">
            Sistema semanal vigente
          </p>
          <h2 className="mt-1 text-balance font-headline text-3xl font-black tracking-[-0.035em] text-[var(--uki-cream)]">
            Reglas de Treasure Hunt
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">
            Así se pagan las partidas, cuándo entras en la clasificación y cómo se reparten las recompensas.
          </p>
        </div>
        <Link
          href="/games/treasure-hunt"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-[var(--uki-lilac)] px-5 text-sm font-black text-[#120716] transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--uki-lilac)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09060f]"
        >
          <Gamepad2 className="h-4 w-4" aria-hidden="true" />
          Jugar Treasure Hunt
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <section className="mb-5 grid overflow-hidden rounded-[12px] border border-[var(--uki-lilac-border-strong)] bg-[linear-gradient(115deg,rgba(228,92,255,0.14),rgba(13,9,20,0.96)_52%)] md:grid-cols-[1.15fr_0.85fr]">
        <div className="p-5 sm:p-7">
          <p className="text-xs font-black text-[var(--uki-lilac)]">La regla esencial</p>
          <h3 className="mt-2 text-balance font-headline text-2xl font-black tracking-[-0.025em] text-[var(--uki-cream)] sm:text-3xl">
            Todas las partidas generan recompensa. Solo algunas compiten.
          </h3>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            Treasure Hunt usa primero tus créditos personales. Cuando no tienes diez disponibles, puede usar créditos del pool. El origen de esos créditos determina si tu puntuación entra en la semana.
          </p>
        </div>
        <dl className="grid border-t border-white/10 sm:grid-cols-2 md:border-l md:border-t-0 md:grid-cols-1">
          <div className="p-5 sm:p-6">
            <dt className="text-xs font-black text-[var(--uki-muted)]">Coste por partida</dt>
            <dd className="mt-1 font-headline text-2xl font-black tabular-nums text-[var(--uki-cream)]">10 créditos</dd>
          </div>
          <div className="border-t border-white/10 p-5 sm:border-l sm:border-t-0 sm:p-6 md:border-l-0 md:border-t">
            <dt className="text-xs font-black text-[var(--uki-muted)]">Semana de juego</dt>
            <dd className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">Lunes 14:00 UTC</dd>
            <p className="mt-1 text-xs font-semibold text-[var(--uki-muted)]">Se renueva automáticamente cada siete días</p>
          </div>
        </dl>
      </section>

      <article className="overflow-hidden rounded-[12px] border border-[var(--uki-lilac-border)] bg-[#0d0914]/96 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <ol className="divide-y divide-white/10">
          <RuleSection
            number={1}
            title="Qué necesitas para jugar"
            summary="La partida queda preparada antes de abrir el juego; si algo falla, no se consume ningún recurso."
          >
            <ul className="grid gap-3 sm:grid-cols-3">
              <li className="rounded-[9px] border border-white/10 bg-black/10 p-4">
                <strong className="block text-[var(--uki-cream)]">10 créditos</strong>
                Se reservan al crear la partida y se descuentan cuando queda confirmada.
              </li>
              <li className="rounded-[9px] border border-white/10 bg-black/10 p-4">
                <strong className="block text-[var(--uki-cream)]">Un Cukie disponible</strong>
                Se asigna uno propio; si no tienes, se utiliza uno del pool.
              </li>
              <li className="rounded-[9px] border border-white/10 bg-black/10 p-4">
                <strong className="block text-[var(--uki-cream)]">Una partida válida</strong>
                Debes terminarla para generar recompensa y, cuando corresponda, clasificación.
              </li>
            </ul>
          </RuleSection>

          <RuleSection
            number={2}
            title="Créditos personales o créditos del pool"
            summary="No eliges una modalidad manualmente: el sistema utiliza la primera fuente que puede pagar la partida completa."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SourceCard title="Partida individual" badge="Créditos personales">
                <p>Recibes la recompensa directa que genere tu puntuación.</p>
                <p><strong className="text-[var(--uki-cream)]">No entra</strong> en la clasificación semanal.</p>
                <p>No tiene límite diario de partidas.</p>
              </SourceCard>
              <SourceCard title="Partida de competición" badge="Créditos del pool">
                <p>Recibes recompensa directa y tu mejor puntuación puede entrar en la semana.</p>
                <p><strong className="text-[var(--uki-cream)]">Sí entra</strong> en la clasificación semanal.</p>
                <p>Máximo 30 partidas al día y 10 resultados diarios por debajo de 100 puntos.</p>
              </SourceCard>
            </div>
            <Link href="/credits" className="inline-flex items-center gap-2 font-black text-[var(--uki-lilac)] hover:text-[var(--uki-cream)]">
              Consultar y gestionar mis créditos <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </RuleSection>

          <RuleSection
            number={3}
            title="Cómo se calcula la recompensa de cada partida"
            summary="Tu puntuación determina el rendimiento. La procedencia de los créditos y del Cukie determina a quién corresponde cada parte."
          >
            <div className="rounded-[10px] border border-[var(--uki-lilac-border)] bg-[var(--uki-lilac-soft)] p-4 sm:p-5">
              <p className="font-black text-[var(--uki-cream)]">Hasta 10 UKI de presupuesto por partida válida</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <p><strong className="block text-lg tabular-nums text-[var(--uki-lilac)]">7,5 UKI</strong>Rendimiento según tu puntuación, entre 0 y 3.000 puntos.</p>
                <p><strong className="block text-lg tabular-nums text-[var(--uki-lilac)]">2 UKI</strong>Se reservan para el bote de la semana.</p>
                <p><strong className="block text-lg tabular-nums text-[var(--uki-lilac)]">0,5 UKI</strong>Reserva máxima del programa de embajadores.</p>
              </div>
            </div>
            <p>
              Con 3.000 puntos conviertes los 7,5 UKI completos; con 1.500 puntos conviertes 3,75 UKI. La parte de rendimiento se reparte entre el jugador y los pools que hayan aportado recursos.
            </p>
            <div className="overflow-x-auto rounded-[9px] border border-white/10">
              <table className="w-full min-w-[42rem] border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-white/[0.035] text-[var(--uki-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-black">Recursos de la partida</th>
                    <th className="px-4 py-3 font-black">Jugador</th>
                    <th className="px-4 py-3 font-black">Pool de créditos</th>
                    <th className="px-4 py-3 font-black">Pool de Cukies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-[var(--uki-text)]">
                  <tr><td className="px-4 py-3 text-[var(--uki-cream)]">Créditos propios + Cukie propio</td><td className="px-4 py-3">100%</td><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td></tr>
                  <tr><td className="px-4 py-3 text-[var(--uki-cream)]">Créditos propios + Cukie del pool</td><td className="px-4 py-3">50%</td><td className="px-4 py-3">—</td><td className="px-4 py-3">50%</td></tr>
                  <tr><td className="px-4 py-3 text-[var(--uki-cream)]">Créditos del pool + Cukie propio</td><td className="px-4 py-3">50%</td><td className="px-4 py-3">50%</td><td className="px-4 py-3">—</td></tr>
                  <tr><td className="px-4 py-3 text-[var(--uki-cream)]">Créditos del pool + Cukie del pool</td><td className="px-4 py-3">25%</td><td className="px-4 py-3">50%</td><td className="px-4 py-3">25%</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--uki-muted)]">Los porcentajes se aplican únicamente a los UKI convertidos por la puntuación, no al presupuesto máximo completo.</p>
            <details className="group rounded-[9px] border border-white/10 bg-black/10 p-4">
              <summary className="cursor-pointer list-none font-black text-[var(--uki-cream)] marker:hidden">
                Ver niveles de rendimiento del jugador (#1–#9)
              </summary>
              <div className="mt-3 space-y-3 text-xs leading-relaxed text-[var(--uki-muted)] sm:text-sm">
                <p>
                  En partidas pagadas por el pool, tu parte se ajusta por tu nivel. Empiezas en #5; puedes subir como máximo dos niveles por semana si completas al menos 20 partidas, o bajar si completas al menos 10 y no alcanzas el rendimiento mínimo.
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-9">
                  {[
                    ['#1', '100%'], ['#2', '90%'], ['#3', '80%'],
                    ['#4', '70%'], ['#5', '60%'], ['#6', '50%'],
                    ['#7', '40%'], ['#8', '30%'], ['#9', '20%'],
                  ].map(([level, value]) => (
                    <div key={level} className="rounded-[7px] border border-white/10 px-2 py-2 text-center">
                      <strong className="block text-[var(--uki-lilac)]">{level}</strong>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </RuleSection>

          <RuleSection
            number={4}
            title="Cómo funciona la clasificación semanal"
            summary="La semana cambia sola; no hay que abrir ni archivar un torneo manualmente."
          >
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <CalendarClock className="h-7 w-7 text-[var(--uki-lilac)]" aria-hidden="true" />
              <div className="space-y-2">
                <p>Cada competición abarca siete periodos de créditos. Consulta las fechas de inicio y cierre en Rankings.</p>
                <p>Solo cuentan las partidas pagadas con créditos del pool y se conserva una única puntuación por wallet: la mejor de la semana.</p>
                <p>Si dos jugadores empatan, queda delante quien consiguió antes esa puntuación.</p>
                <p>Al comenzar la semana siguiente, la clasificación anterior queda congelada en el historial.</p>
              </div>
            </div>
            <Link href="/games/treasure-hunt/rankings" className="inline-flex items-center gap-2 font-black text-[var(--uki-lilac)] hover:text-[var(--uki-cream)]">
              Ver la semana actual <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </RuleSection>

          <RuleSection
            number={5}
            title="Cómo se reparte el bote semanal"
            summary="Cada partida válida añade 2 UKI al bote, independientemente de que use créditos personales o del pool."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <SourceCard title="Top 10" badge="60% del bote">
                <p>Se reparte por posición: 9%, 8%, 7%, 6,5%, 6%, 5,5%, 5%, 4,5%, 4,5% y 4%.</p>
              </SourceCard>
              <SourceCard title="Puestos 11 a 25" badge="30% del bote">
                <p>Cada una de las quince posiciones recibe un 2% del bote semanal.</p>
              </SourceCard>
              <SourceCard title="Sorteo semanal" badge="10% del bote">
                <p>Diez wallets fuera del Top 25 reciben un 1% cada una si completaron al menos diez partidas de más de 100 puntos.</p>
              </SourceCard>
            </div>
            <p className="flex items-start gap-3 rounded-[9px] border border-white/10 bg-black/10 p-4">
              <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
              <span>El reparto se procesa después del cierre de la competición y la confirmación de sus resultados. Cuando quede registrado, podrás seguirlo desde <Link href="/premios" className="font-black text-[var(--uki-lilac)] hover:text-[var(--uki-cream)]">Premios</Link>.</span>
            </p>
          </RuleSection>

          <RuleSection
            number={6}
            title="Abandonos, fallos y torneos especiales"
            summary="La interfaz distingue una partida abandonada de un error del sistema."
          >
            <ul className="list-disc space-y-2 pl-5">
              <li>Si abandonas o cierras voluntariamente, se consumen los 10 créditos y la partida disponible del Cukie; no hay recompensa ni clasificación.</li>
              <li>Si el sistema no puede crear o completar la partida, libera los créditos y el Cukie sin generar cargos.</li>
              <li>Una partida creada antes del corte semanal permanece vinculada a esa semana aunque termine después.</li>
              <li>Los torneos especiales cerrados conservan sus reglas y clasificación en el historial, pero nunca sustituyen la semana vigente.</li>
            </ul>
          </RuleSection>
        </ol>
      </article>
    </div>
  );
}
