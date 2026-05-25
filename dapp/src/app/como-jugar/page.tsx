import type { Metadata } from 'next';
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
      secondaryCta={{ label: 'Ver wallet', href: '/wallet' }}
      metrics={[
        { label: 'Entrada', value: '10 créditos', helper: 'Por partida' },
        { label: 'Pool semanal', value: '2.5 créditos', helper: 'Van al bote semanal' },
        { label: 'En juego', value: '7.5 créditos', helper: 'Convertidos según score' },
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
          title: 'Reparto si se convierten 7.5 UKI',
          table: {
            headers: ['Caso', 'Pool créditos', 'Pool Cukies', 'Jugador'],
            rows: [
              ['Créditos prestados + Cukie prestado', '3.75 UKI', '1.875 UKI', 'Ranking sobre 1.875 UKI'],
              ['Créditos prestados + Cukie propio', '3.75 UKI', '0', 'Ranking sobre 3.75 UKI'],
              ['Créditos propios + Cukie prestado', '0', '3.75 UKI', '3.75 UKI'],
              ['Créditos propios + Cukie propio', '0', '0', '7.5 UKI'],
            ],
          },
        },
      ]}
      note="Pendiente de decisión de producto: confirmar si el usuario elige manualmente el Cukie propio o si conviene automatizar la selección antes de crear la sesión."
    />
  );
}
