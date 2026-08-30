import type { Metadata } from 'next';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { WalletDashboardWorkspace } from '@/components/wallet/dashboard-workspace';

export const metadata: Metadata = {
  title: 'Wallet UKI | Cukies World',
  description: 'Vista de wallet para UKI, NFTs, créditos, Cukie Master y rewards.',
};

export const dynamic = 'force-dynamic';

export default function WalletInfoPage() {
  return (
    <LaunchInfoPage
      variant="workspace"
      eyebrow="Panel"
      title="Wallet UKI"
      subtitle="Consulta y gestiona desde un único acceso tu identidad de wallet, atribución de embajador y accesos a Cukie Master, créditos, pools y rewards."
      heroImage="/brand/generated/uki-utility-map-scene-v3.png"
      heroAlt="Mapa de utilidad UKI con token y bóveda"
      primaryCta={{ label: 'Abrir mi panel', href: '#ambassador-program' }}
      secondaryCta={{ label: 'Ver Cukie Master', href: '/cukie-master' }}
      metrics={[
        { label: 'UKI', value: 'Compra + vesting', helper: 'Asignación y desbloqueo' },
        { label: 'NFTs', value: 'Estado canónico', helper: 'Disponible, listado, pool o bloqueo' },
        { label: 'Créditos', value: 'Balance interno', helper: 'Uso, expiración y origen' },
        { label: 'Rewards', value: 'Pendiente / reclamable', helper: 'Sin mezclar estimaciones con claims' },
      ]}
      beforeSections={<WalletDashboardWorkspace />}
      sections={[
        {
          title: 'Módulos esperados',
          bullets: [
            'Wallet conectada, red activa y alertas de chain incorrecta.',
            'UKI comprado, UKI en vesting, UKI liberado y staking cuando exista.',
            'NFTs disponibles o bloqueados por marketplace, bridge, pool o partida.',
            'Créditos de competición disponibles, origen y expiración.',
          ],
        },
        {
          title: 'Marketplace y Cukies',
          bullets: [
            'El dashboard debe enlazar al marketplace y mostrar estado de listings.',
            'Un NFT listado, en bridge o con ownership inconsistente no debe aparecer como elegible.',
            'Los pools y Cukie Master se muestran como resumen con enlaces a pantallas dedicadas.',
          ],
        },
        {
          title: 'Estados de rewards',
          bullets: [
            'estimated: cifra calculada off-chain que puede cambiar.',
            'pending: periodo cerrado o en validación, aún no reclamable.',
            'claimable: existe batch/proof o dato de claim preparado.',
            'claimed: confirmado por evento o transacción on-chain.',
          ],
        },
        {
          title: 'No debe hacer',
          bullets: [
            'No debe ser el lugar principal para comprar UKI.',
            'No debe ejecutar configuración avanzada de pools.',
            'No debe presentar rewards estimadas como tokens recibidos.',
          ],
        },
      ]}
      note="El dashboard es una vista de salud y acceso de wallet. Las acciones especializadas permanecen en Cukie Master, pools, juegos, marketplace, vesting y rewards claim."
    />
  );
}
