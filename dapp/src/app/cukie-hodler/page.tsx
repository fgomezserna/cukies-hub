import type { Metadata } from 'next';
import { LaunchInfoPage } from '@/components/launch/info-page';

export const metadata: Metadata = {
  title: 'Cukie Hodler | Cukies World',
  description: 'Pool de Cukies, elegibilidad y uso de NFTs dentro de la economía UKI.',
};

export default function CukieHodlerPage() {
  return (
    <LaunchInfoPage
      eyebrow="Pool de Cukies"
      title="Cukie Hodler"
      subtitle="Una página para holders que quieran entender cómo aportar Cukies al pool, qué estados bloquean un NFT y cómo se asignan partidas disponibles."
      heroImage="/brand/generated/cukie-master-pools-v2.png"
      heroAlt="Cofre de recursos Cukies para pools"
      primaryCta={{ label: 'Ver Cukie Master', href: '/cukie-master' }}
      secondaryCta={{ label: 'Cómo jugar', href: '/como-jugar' }}
      metrics={[
        { label: 'Pools', value: '2 rutas', helper: 'Originales y segunda generación' },
        { label: 'Espera mínima', value: '24h', helper: 'Antes de primera asignación' },
        { label: 'Prioridad', value: 'Originales', helper: 'Se prestan antes que segunda gen' },
        { label: 'Fallback', value: 'Seiku', helper: 'Si no hay Cukies disponibles' },
      ]}
      sections={[
        {
          title: 'Cómo funciona el pool',
          bullets: [
            'Los usuarios pueden aportar Cukies para que otros jugadores los usen.',
            'Hay pools separados para Cukies Originales y Cukies de segunda generación.',
            'Primero se prestan Originales; si se agotan, se prestan de segunda generación.',
            'Si no hay ningún Cukie disponible, se asigna un Seiku ficticio.',
          ],
        },
        {
          title: 'Elegibilidad de NFT',
          bullets: [
            'No se debe permitir aportar un NFT listado en marketplace.',
            'No se debe permitir aportar un NFT en bridge, bloqueado, invalidado o con ownership inconsistente.',
            'Las nuevas posiciones se orientan a BSC; Tron queda para lectura o migración salvo nueva decisión.',
            'Un Cukie usado para Cukie Master no queda disponible para prestarlo a otros jugadores.',
          ],
        },
        {
          title: 'Partidas disponibles',
          table: {
            headers: ['Rareza', 'Original', 'Segunda generación o superior'],
            rows: [
              ['Común', '2', '1'],
              ['No Común', '4', '2'],
              ['Raro', '6', '3'],
              ['Épico', '8', '4'],
              ['Legendario', '10', '5'],
              ['Goat', '12', '6'],
            ],
          },
        },
        {
          title: 'Reparto por rareza',
          text: 'Las asignaciones para propietarios se reparten por tramos de rareza. Cada tramo previsto representa 16.66%: todos, No Común o superior, Raro o superior, Épico o superior, Legendario o superior y Goat.',
        },
      ]}
      note="El pool debe mostrar estados reales del NFT: available, listed, bridging, soft_staked, in_pool, assigned_to_game, invalidated o unknown. Ocultar estos estados crearía doble uso y confusión."
    />
  );
}
