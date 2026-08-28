import type { Metadata } from 'next';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { CukiePoolStatusPanel } from '@/components/cukie-pool/status-panel';

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
        { label: 'Custodia', value: '1 vault', helper: 'Originales y segunda generación' },
        { label: 'Espera mínima', value: '24h', helper: 'Antes de primera asignación' },
        { label: 'Prioridad', value: 'Originales', helper: 'Se prestan antes que segunda gen' },
        { label: 'Fallback', value: 'Seiku', helper: 'Si no hay Cukies disponibles' },
      ]}
      sections={[
        {
          title: 'Cómo funciona el pool',
          bullets: [
            'Los usuarios depositan físicamente sus Cukies en un vault para que otros jugadores usen sus partidas disponibles.',
            'Un único contrato custodia Cukies Originales y de segunda generación; el cálculo y reparto se mantienen separados por generación.',
            'Primero se prestan Originales; si se agotan, se prestan de segunda generación.',
            'Si no hay ningún Cukie disponible, se asigna un Seiku; esas partidas no generan recompensa para el Cukie Pool.',
          ],
        },
        {
          title: 'Elegibilidad de NFT',
          bullets: [
            'El NFT depositado queda bajo custodia del contrato y no puede venderse, transferirse, jugarse por su propietario ni usarse simultáneamente como Cukie Master.',
            'No se permite depositar un NFT en bridge, bloqueado, invalidado o con ownership inconsistente.',
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
          text: 'Cada generación se liquida por separado con niveles acumulativos: todos 45%, No Común o superior 20%, Raro o superior 15%, Épico o superior 12%, Legendario o superior 7% y Goat 1%.',
        },
      ]}
      afterSections={<CukiePoolStatusPanel />}
      note="El depósito se activa al comenzar el siguiente periodo de las 14:00 UTC. Si se solicita la salida, el NFT puede seguir prestándose hasta el corte, pero deja de participar en el reparto de ese periodo y queda retirable al finalizarlo."
    />
  );
}
