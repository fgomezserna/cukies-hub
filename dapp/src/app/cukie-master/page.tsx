import type { Metadata } from 'next';
import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { UKI_PRESALE_CHAIN_LABEL } from '@/components/landing/sale-config';

export const metadata: Metadata = {
  title: 'Cukie Master por UKI | Cukies World',
  description: 'Consulta tus plazas Cukie Master y gestiona el staking de UKI.',
};

export const dynamic = 'force-dynamic';

export default function CukieMasterPage() {
  const isStaging = process.env.APP_ENV?.trim().toLowerCase() === 'staging';

  return (
    <LaunchInfoPage
      variant="workspace"
      eyebrow={`${isStaging ? 'Área de pruebas' : 'Red configurada'} · ${UKI_PRESALE_CHAIN_LABEL}`}
      title="Conviértete en Cukie Master"
      subtitle="Stakea tus UKI y desbloquea tus Cukie Master. Tus UKI de preventa pendientes y tus UKI en staking se suman automáticamente."
      heroImage="/brand/generated/uki-cukie-master-scene-v2.png"
      heroAlt="Escena Cukie Master con token UKI y bóveda"
      primaryCta={{ label: 'Gestionar staking', href: '#uki-staking' }}
      secondaryCta={{ label: 'Ver competición', href: '/games/treasure-hunt/competitions' }}
      metrics={[
        { label: 'Por Cukie Master', value: '20.000 UKI', helper: 'Vesting y staking suman' },
        { label: 'Por wallet', value: 'Máximo 5', helper: 'Mediante UKI' },
        { label: 'Plazas con UKI', value: 'Hasta 2.500', helper: 'Capacidad máxima' },
      ]}
      beforeSections={<CukieMasterWorkspace testnetOnly={isStaging} />}
      sections={[
        {
          title: 'Cómo funciona',
          bullets: [
            '20.000 UKI equivalen a 1 Cukie Master.',
            'Tus UKI en vesting y en staking se suman automáticamente.',
            'Puedes conseguir un máximo de 5 Cukie Masters mediante UKI.',
          ],
        },
        {
          title: 'Staking y competición',
          text: 'Solo los UKI depositados en staking conceden partidas para el Torneo Lanzamiento UKI.',
          bullets: [
            'Cada 2.000 UKI completos en staking te permiten jugar 1 partida.',
            'Puedes retirar cuando quieras, pero una retirada durante el torneo descalifica la wallet.',
            'Los intentos, resultados y tickets se consultan directamente en Treasure Hunt.',
          ],
        },
      ]}
      note="Comprueba siempre la red, la cantidad y el contrato antes de confirmar una operación. El staking no implica rentabilidad garantizada."
    />
  );
}
