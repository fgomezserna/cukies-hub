import type { Metadata } from 'next';
import { LaunchInfoPage } from '@/components/launch/info-page';

export const metadata: Metadata = {
  title: 'Wallet UKI | Cukies World',
  description: 'Vista de wallet para UKI, NFTs, créditos, Cukie Master y rewards.',
};

export default function WalletInfoPage() {
  return (
    <LaunchInfoPage
      eyebrow="Panel"
      title="Wallet UKI"
      subtitle="La vista de wallet resume estado de compra, vesting, NFTs, créditos, cupos, pools y alertas sin sustituir las pantallas especializadas."
      heroImage="/brand/generated/uki-utility-map-scene-v2.png"
      heroAlt="Mapa de utilidad UKI con token y bóveda"
      primaryCta={{ label: 'Conectar wallet', href: '/#presale-console' }}
      secondaryCta={{ label: 'Ver Cukie Master', href: '/cukie-master' }}
      metrics={[
        { label: 'UKI', value: 'Compra + vesting', helper: 'Asignación y desbloqueo' },
        { label: 'NFTs', value: 'Estado canónico', helper: 'Disponible, listado, pool o bloqueo' },
        { label: 'Créditos', value: 'Balance interno', helper: 'Uso, expiración y origen' },
        { label: 'Rewards', value: 'Pendiente / reclamable', helper: 'Sin mezclar estimaciones con claims' },
      ]}
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
      note="El dashboard es una vista de salud de wallet. Las acciones complejas deben vivir en preventa, Cukie Master, pools, juegos, arena y rewards claim."
    />
  );
}
