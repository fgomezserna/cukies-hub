import type { Metadata } from 'next';
import { CukieMasterFaq } from '@/components/cukie-master/faq';
import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { UKI_PRESALE_CHAIN_LABEL } from '@/components/landing/sale-config';

export const metadata: Metadata = {
  title: 'Cukie Master por UKI | Cukies World',
  description: 'Consulta tus cupos Cukie Master, gestiona el staking de UKI y decide cómo usar tus créditos diarios.',
};

export const dynamic = 'force-dynamic';

export default function CukieMasterPage() {
  const isStaging = process.env.APP_ENV?.trim().toLowerCase() === 'staging';

  return (
    <LaunchInfoPage
      variant="workspace"
      eyebrow={`${isStaging ? 'Área de pruebas' : 'Red configurada'} · ${UKI_PRESALE_CHAIN_LABEL}`}
      title="Conviértete en Cukie Master"
      subtitle="20.000 UKI computables equivalen inicialmente a 1 Cukie Master. Consulta tu vesting, gestiona el staking y comprueba tu progreso en la ruta UKI."
      heroImage="/brand/generated/uki-cukie-master-scene-v2.png"
      heroAlt="Escena Cukie Master con token UKI y bóveda"
      primaryCta={{ label: 'Gestionar staking UKI', href: '#uki-staking' }}
      secondaryCta={{ label: 'Stakear Cukies Originales', href: '#cukie-master-nft-staking' }}
      metrics={[
        { label: 'Por cupo UKI', value: '20.000 UKI', helper: 'Requisito inicial computable' },
        { label: 'Capacidad inicial', value: '500', helper: 'Cupos globales de la ruta UKI' },
        { label: 'Capacidad máxima', value: '2.500', helper: 'Cupos globales de la ruta UKI' },
        { label: 'Créditos diarios', value: '100', helper: 'Por cupo maduro y elegible' },
      ]}
      beforeSections={<CukieMasterWorkspace testnetOnly={isStaging} />}
      afterSections={<CukieMasterFaq />}
      sections={[
        {
          title: 'Cómo funciona la ruta UKI',
          bullets: [
            'Cada 20.000 UKI computables conceden inicialmente 1 cupo Cukie Master.',
            'Tu asignación de preventa pendiente de vesting y tus UKI confirmados en staking se suman automáticamente.',
            'Puedes mantener un máximo de 5 cupos mediante UKI en la misma wallet.',
          ],
        },
        {
          title: 'Capacidad y cambios de requisito',
          text: 'La ruta UKI empieza con 500 cupos globales y puede ampliarse hasta 2.500.',
          bullets: [
            'El requisito no sube de forma automática al llenarse la capacidad.',
            'Una subida aprobada abre una ventana de gracia de 48 horas para ajustar el staking.',
            'Puedes depositar UKI adicionales como margen, sin superar el máximo de 5 cupos UKI.',
          ],
        },
        {
          title: 'Créditos propios o pool',
          text: 'Cada cupo debe mantenerse 24 horas antes de su primera entrega. Después recibe 100 créditos en cada corte diario elegible.',
          bullets: [
            'Antes del corte eliges, en múltiplos de 10, cuántos créditos conserva el cupo y cuántos aporta al pool.',
            'Los créditos propios se usan para jugar; una partida también puede tomar créditos del pool según sus reglas.',
            'Los créditos no se transfieren entre wallets y no equivalen directamente a UKI.',
          ],
        },
        {
          title: 'La ruta con Cukies sigue disponible',
          text: 'La entrada principal se centra en UKI, pero el staking custodial de Cukies Originales continúa operativo en este mismo workspace.',
          bullets: [
            'Cada 3 puntos de rareza depositados conceden inicialmente 1 cupo en la ruta Cukies.',
            'La ruta Cukies tiene su propio máximo de 5 cupos por wallet y no consume el límite UKI.',
            'Un Cukie depositado no puede jugarse, venderse ni transferirse hasta retirarlo del vault.',
          ],
        },
      ]}
      note={`Comprueba siempre ${UKI_PRESALE_CHAIN_LABEL}, la cantidad y el contrato antes de confirmar. Ser Cukie Master, aportar al pool o hacer staking no garantiza rentabilidad.`}
    />
  );
}
