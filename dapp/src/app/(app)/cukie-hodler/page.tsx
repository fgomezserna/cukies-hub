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
      variant="workspace"
      eyebrow="Pool de Cukies"
      title="Cukie Hodler"
      subtitle="Aporta tus Cukies al pool, consulta su estado y participa en el reparto de premios por las partidas en las que se utilicen."
      heroImage="/brand/generated/cukie-master-pools-v2.png"
      heroAlt="Cofre de recursos Cukies para pools"
      primaryCta={{ label: 'Ver Cukie Master', href: '/cukie-master' }}
      secondaryCta={{ label: 'Cómo jugar', href: '/como-jugar' }}
      metrics={[
        { label: 'Protección', value: 'Custodia segura', helper: 'Originales y segunda generación' },
        { label: 'Espera mínima', value: '24h', helper: 'Antes de primera asignación' },
        { label: 'Prioridad', value: 'Originales', helper: 'Se prestan antes que segunda gen' },
        { label: 'Alternativa', value: 'Seiku', helper: 'Si no hay Cukies disponibles' },
      ]}
      beforeSections={<CukiePoolStatusPanel />}
      sections={[
        {
          title: 'Cómo funciona el pool',
          bullets: [
            'Deposita tus Cukies de forma segura para que otros jugadores puedan usar sus partidas disponibles.',
            'Cukies Originales y de segunda generación participan por separado en el cálculo y el reparto.',
            'Primero se prestan Originales; si se agotan, se prestan de segunda generación.',
            'Si no hay ningún Cukie disponible, se asigna un Seiku; esas partidas no generan recompensa para el Cukie Pool.',
          ],
        },
        {
          title: 'Elegibilidad de NFT',
          bullets: [
            'El NFT depositado queda bajo custodia del contrato y no puede venderse, transferirse, jugarse por su propietario ni usarse simultáneamente como Cukie Master.',
            'No se puede aportar un Cukie bloqueado, en migración o cuyo propietario no pueda comprobarse.',
            'Antes de cada depósito se comprueba que el Cukie está disponible y pertenece a tu wallet.',
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
      note="El depósito se activa al comenzar el siguiente periodo diario. Si solicitas la salida, el Cukie puede seguir utilizándose hasta el corte, pero deja de participar en el reparto de ese periodo y podrás retirarlo al finalizar."
    />
  );
}
