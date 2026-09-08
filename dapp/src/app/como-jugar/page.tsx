import type { Metadata } from 'next';
import Link from 'next/link';
import { LaunchInfoPage } from '@/components/launch/info-page';

export const metadata: Metadata = {
  title: 'Cómo jugar | Cukies World',
  description: 'Reglas de entrada, créditos y reparto base para Treasure Hunt.',
};

export default function ComoJugarPage() {
  return (
    <LaunchInfoPage
      eyebrow="Treasure Hunt"
      title="Cómo jugar"
      subtitle="Treasure Hunt es el primer juego conectado a UKI. La entrada combina créditos de competición, Cukies disponibles y validación de score."
      heroImage="/brand/generated/uki-treasure-hunt-scene-v2.png"
      heroAlt="Escena de Treasure Hunt en jungla con cofre"
      primaryCta={{ label: 'Ver juegos', href: '/games' }}
      secondaryCta={{ label: 'Ver dashboard', href: '/dashboard' }}
      variant="workspace"
      metrics={[
        { label: 'Entrada', value: '10 créditos', helper: 'Por partida' },
        { label: 'Rendimiento', value: '7,5 UKI', helper: 'Se convierte según tu puntuación' },
        { label: 'Bote semanal', value: '2 UKI', helper: 'Por partida válida' },
        { label: 'Reserva', value: '0,5 UKI', helper: 'Programa de embajadores' },
        { label: 'Score máximo', value: '3,000', helper: 'Convierte el 100%' },
      ]}
      sections={[
        {
          title: 'Recursos necesarios',
          bullets: [
            'Una partida requiere 10 créditos de competición.',
            'También requiere un Cukie con partidas disponibles.',
            'Si el jugador no tiene créditos propios, puede recibir créditos del pool mientras haya disponibilidad.',
            'Si no tiene Cukies disponibles, se asigna un Cukie del pool o un Seiku ficticio.',
          ],
        },
        {
          title: 'Créditos y ranking',
          bullets: [
            'Las partidas con créditos propios no computan para ranking.',
            'Las partidas con créditos del pool sí computan para ranking.',
            'El sistema elige automáticamente la primera fuente con saldo suficiente para pagar la partida completa.',
            'En partidas con créditos del pool se usa el ranking del jugador para calcular su parte.',
          ],
        },
        {
          title: 'Conversión por score',
          bullets: [
            'La conversión es lineal entre 0 y 3,000 puntos.',
            '3,000 puntos o más convierten el 100% de los 7.5 créditos en juego.',
            '1,000 puntos convierten 33.33%.',
          ],
        },
        {
          title: 'Reglas y reparto',
          bullets: [
            'El presupuesto de cada partida válida es 7,5 UKI de rendimiento, 2 UKI para el bote semanal y 0,5 UKI de reserva máxima del programa de embajadores.',
            'La procedencia de los créditos y del Cukie determina cómo se distribuye el rendimiento convertido.',
          ],
        },
      ]}
      afterSections={(
        <section className="uki-container relative z-[2] pb-14">
          <div className="rounded-[10px] border border-[var(--uki-lilac-border)] bg-[#0d0914]/82 p-5 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            Consulta el detalle vigente de porcentajes, clasificación y casos de reparto en{' '}
            <Link href="/games/treasure-hunt/rules" className="font-black text-[var(--uki-lilac)] hover:text-[var(--uki-cream)]">
              las reglas de Treasure Hunt
            </Link>.
          </div>
        </section>
      )}
    />
  );
}
