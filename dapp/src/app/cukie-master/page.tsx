import type { Metadata } from 'next';
import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { UKI_PRESALE_CHAIN_LABEL } from '@/components/landing/sale-config';

export const metadata: Metadata = {
  title: 'Cukie Master | Staking de Cukies y UKI | Cukies World',
  description: 'Deposita Cukies Originales o stakea UKI, gestiona tus cupos y decide cómo usar tus créditos diarios.',
};

export const dynamic = 'force-dynamic';

export default function CukieMasterPage() {
  const isStaging = process.env.APP_ENV?.trim().toLowerCase() === 'staging';

  return (
    <LaunchInfoPage
      variant="workspace"
      eyebrow={`${isStaging ? 'Área de pruebas' : 'Red configurada'} · ${UKI_PRESALE_CHAIN_LABEL}`}
      title="Conviértete en Cukie Master con tus Cukies o tus UKI"
      subtitle="Deposita Cukies Originales en el vault o suma tus UKI de vesting y staking. Cada cupo maduro recibe créditos diarios que puedes usar para jugar o aportar al pool."
      heroImage="/brand/generated/uki-cukie-master-scene-v2.png"
      heroAlt="Escena Cukie Master con token UKI y bóveda"
      primaryCta={{ label: 'Stakear mis Cukies', href: '#cukie-master-nft-staking' }}
      secondaryCta={{ label: 'Gestionar UKI', href: '#uki-staking' }}
      metrics={[
        { label: 'Ruta Cukies', value: '3 puntos', helper: 'Por cupo inicial' },
        { label: 'Ruta UKI', value: '20.000 UKI', helper: 'Por cupo inicial' },
        { label: 'Créditos diarios', value: '100', helper: 'Por cupo maduro' },
        { label: 'Máximo por wallet', value: '5 + 5', helper: 'Cinco por cada ruta' },
      ]}
      beforeSections={<CukieMasterWorkspace testnetOnly={isStaging} />}
      sections={[
        {
          title: 'Dos rutas independientes',
          bullets: [
            'Cada 3 puntos de rareza de Cukies Originales depositados conceden inicialmente 1 cupo.',
            'Cada 20.000 UKI computables conceden inicialmente 1 cupo; vesting pendiente y staking se suman.',
            'Puedes mantener hasta 5 cupos por Cukies y otros 5 por UKI en la misma wallet.',
            'Un Cukie depositado queda custodiado por el contrato y no puede jugarse, venderse ni transferirse hasta retirarlo.',
          ],
        },
        {
          title: 'Créditos propios o pool',
          text: 'Cada cupo debe mantenerse 24 horas antes de su primera entrega. Después recibe 100 créditos en cada corte diario de las 14:00 UTC.',
          bullets: [
            'Antes del corte eliges, en múltiplos de 10, cuántos créditos conserva el cupo y cuántos aporta al pool.',
            'Los créditos propios se usan primero para jugar; si no alcanzan, una partida puede tomar exactamente 10 créditos del pool.',
            'Los créditos no se transfieren entre wallets y no equivalen directamente a UKI.',
          ],
        },
        {
          title: 'Staking UKI y competición',
          text: 'La condición Cukie Master y el Torneo Lanzamiento UKI son cálculos distintos.',
          bullets: [
            'Cukie Master suma vesting pendiente y UKI depositados en staking.',
            'El torneo usa exclusivamente UKI confirmados en staking: cada 2.000 UKI completos conceden una partida.',
            'Retirar durante el torneo descalifica la wallet para esa campaña, aunque vuelva a depositar.',
          ],
        },
      ]}
      note="Comprueba siempre la red, el NFT, la cantidad y el contrato antes de confirmar. Ser Cukie Master, aportar al pool o hacer staking no garantiza rentabilidad."
    />
  );
}
