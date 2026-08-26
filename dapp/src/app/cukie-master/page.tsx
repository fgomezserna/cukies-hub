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
      subtitle="20.000 UKI computables equivalen a una plaza Cukie Master. En esta versión simplificada puedes consultar tu vesting, gestionar tu staking y ver el progreso de la ruta UKI."
      heroImage="/brand/generated/uki-cukie-master-scene-v2.png"
      heroAlt="Escena Cukie Master con token UKI y bóveda"
      primaryCta={{ label: 'Gestionar staking', href: '#uki-staking' }}
      secondaryCta={{ label: 'Ver competición', href: '/games/treasure-hunt/competitions' }}
      metrics={[
        { label: 'Por plaza', value: '20.000 UKI', helper: 'Requisito inicial computable' },
        { label: 'Por wallet', value: 'Máximo 5', helper: 'En la ruta UKI' },
        { label: 'Capacidad inicial', value: '500', helper: 'Plazas de la ruta UKI' },
        { label: 'Capacidad máxima', value: '2.500', helper: 'Plazas de la ruta UKI' },
      ]}
      beforeSections={<CukieMasterWorkspace testnetOnly={isStaging} />}
      sections={[
        {
          title: 'Cómo funciona la ruta UKI',
          text: 'El cálculo suma dos fuentes verificadas: tu asignación de preventa todavía bloqueada y los UKI depositados en UKIStaking.',
          bullets: [
            'Cada 20.000 UKI computables conceden inicialmente una plaza Cukie Master.',
            'Puedes conseguir como máximo 5 plazas mediante UKI.',
            'Los UKI líquidos de la wallet no cuentan hasta que se depositan; al reclamar vesting dejan de contar por vesting y vuelven a contar si los depositas.',
          ],
        },
        {
          title: 'Capacidad y cambios de requisito',
          text: 'La ruta UKI empieza con 500 plazas y puede ampliarse hasta un máximo independiente de 2.500. La ruta NFT dispone de otras 2.500 plazas máximas.',
          bullets: [
            'Si la capacidad disponible se llena y no se amplía, el requisito puede aumentar para nuevas posiciones.',
            'Cuando cambia el requisito se aplica una ventana de gracia inicial de 48 horas para ajustar tus activos.',
            'Depositar UKI adicionales puede servir como margen ante una futura subida del requisito, pero no supera el máximo de 5 plazas.',
          ],
        },
        {
          title: 'Activación y créditos',
          bullets: [
            'Cada nueva plaza debe mantenerse al menos 24 horas antes de su primera entrega de créditos.',
            'Una plaza elegible aporta 100 créditos diarios en el corte correspondiente.',
            '100 créditos no equivalen ni garantizan 100 UKI: los resultados dependen de las reglas económicas y de las partidas válidas.',
            'El staking puede retirarse sin cooldown; los créditos ya concedidos conservan su caducidad normal.',
          ],
        },
        {
          title: 'Cukie Master y torneo son cálculos distintos',
          text: 'La condición Cukie Master usa vesting sin reclamar + staking. El Torneo Lanzamiento UKI usa exclusivamente el saldo confirmado en UKIStaking.',
          bullets: [
            'Para el torneo, cada 2.000 UKI completos en staking conceden una partida.',
            'Retirar durante el torneo descalifica esa wallet para la campaña aunque vuelva a depositar.',
            'Consulta intentos, ranking, tickets y cuenta atrás desde Treasure Hunt.',
          ],
        },
      ]}
      note="Ser Cukie Master o hacer staking no implica rentabilidad garantizada. En staging se utilizan UKI y tBNB de BSC Testnet sin valor real. Comprueba la red y el contrato antes de confirmar cada operación."
    />
  );
}
