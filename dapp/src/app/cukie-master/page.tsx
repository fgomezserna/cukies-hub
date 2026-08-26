import type { Metadata } from 'next';
import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { UKI_PRESALE_CHAIN_LABEL } from '@/components/landing/sale-config';

export const metadata: Metadata = {
  title: 'Staking UKI | Cukies World',
  description: 'Deposita UKI en BNB Smart Chain y desbloquea partidas de Treasure Hunt.',
};

export const dynamic = 'force-dynamic';

export default function CukieMasterPage() {
  const isStaging = process.env.APP_ENV?.trim().toLowerCase() === 'staging';

  return (
    <LaunchInfoPage
      variant="workspace"
      eyebrow={`${isStaging ? 'Área de pruebas' : 'Red configurada'} · ${UKI_PRESALE_CHAIN_LABEL}`}
      title="Staking de UKI"
      subtitle="Deposita UKI para desbloquear partidas en la nueva competición de Treasure Hunt. Esta versión de Cukie Master muestra únicamente el staking necesario para probar el lanzamiento."
      heroImage="/brand/generated/uki-cukie-master-scene-v2.png"
      heroAlt="Escena Cukie Master con token UKI y bóveda"
      primaryCta={{ label: 'Gestionar staking', href: '#uki-staking' }}
      secondaryCta={{ label: 'Ver competición', href: '/games/treasure-hunt/competitions' }}
      metrics={[
        { label: 'Partida', value: '2.000 UKI', helper: 'En staking por cada intento' },
        { label: 'Resultados', value: 'Top 10', helper: 'Mejores puntuaciones por wallet' },
        { label: 'Tickets', value: '1 / 100 pts', helper: 'Redondeo siempre hacia abajo' },
        { label: 'Retirada', value: 'Inmediata', helper: 'Descalifica durante la campaña' },
      ]}
      beforeSections={<CukieMasterWorkspace testnetOnly={isStaging} />}
      sections={[
        {
          title: 'Cómo desbloqueas partidas',
          text: 'Solo cuenta el saldo confirmado dentro del contrato UKIStaking. Los UKI líquidos de la wallet o bloqueados en vesting no conceden intentos.',
          bullets: [
            'Cada 2.000 UKI completos en staking conceden una partida durante la campaña.',
            'El intento se consume cuando el servidor inicia la partida, aunque se cierre antes de terminar.',
            'Aumentar el staking puede conceder nuevos intentos; las fracciones inferiores a 2.000 UKI no conceden uno adicional.',
          ],
        },
        {
          title: 'Retirar durante la competición',
          text: 'El contrato permite retirar inmediatamente, pero la competición conserva el historial on-chain.',
          bullets: [
            'Cualquier retirada confirmada entre el inicio y el cierre descalifica la wallet de esa campaña.',
            'Volver a depositar después no elimina la descalificación.',
            'Después del cierre publicado puedes retirar sin depender de cuándo se ejecute el sorteo.',
          ],
        },
        {
          title: 'Puntuaciones y tickets',
          bullets: [
            'Solo se conservan las 10 mejores puntuaciones válidas de cada wallet.',
            'Cada resultado genera floor(puntuación / 100) tickets.',
            'Una wallet puede resultar ganadora como máximo una vez.',
          ],
        },
      ]}
      note="Staking no implica rentabilidad garantizada. En staging se utilizan UKI y tBNB de BSC Testnet sin valor real. Comprueba la red y el contrato antes de confirmar cada operación."
    />
  );
}
