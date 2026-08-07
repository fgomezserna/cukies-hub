import type { Metadata } from 'next';
import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';
import { CukieMasterStatusPanel } from '@/components/cukie-master/status-panel';
import { UkiStakingPanel } from '@/components/cukie-master/uki-staking-panel';
import { LaunchInfoPage } from '@/components/launch/info-page';

export const metadata: Metadata = {
  title: 'Cukie Master | Cukies World',
  description: 'Requisitos, cupos y créditos de competición para Cukie Master.',
};

export default function CukieMasterPage() {
  return (
    <LaunchInfoPage
      eyebrow="Funcional en BSC Testnet"
      title="Cukie Master"
      subtitle="Gestiona el staking de UKI, consulta tus cupos por UKI o Cukies Originales y revisa los créditos de competición desde un único apartado."
      heroImage="/brand/generated/uki-cukie-master-scene-v2.png"
      heroAlt="Escena Cukie Master con token UKI y bóveda"
      primaryCta={{ label: 'Gestionar staking', href: '#uki-staking' }}
      secondaryCta={{ label: 'Ver mis cupos', href: '#mi-estado' }}
      metrics={[
        { label: 'Ruta UKI', value: '500 cupos', helper: '20,000 UKI por cupo inicial' },
        { label: 'Ruta Cukies', value: '500 cupos', helper: '3 puntos en Cukies Originales' },
        { label: 'Límite wallet', value: '10 cupos', helper: 'Máximo 5 por cada ruta' },
        { label: 'Créditos', value: '100 diarios', helper: 'Por cupo activo tras 24h' },
      ]}
      beforeSections={
        <>
          <UkiStakingPanel />
          <CukieMasterStatusPanel />
          <CompetitionCreditPanel />
        </>
      }
      sections={[
        {
          title: 'Ruta UKI',
          text: 'Los UKI comprados en preventa cuentan para Cukie Master aunque estén en vesting.',
          bullets: [
            'Requisito inicial: 20,000 UKI por cupo.',
            'Se suma UKI en vesting y UKI liberado o stakeado adicional.',
            'El exceso no da beneficios extra, pero sirve como margen si sube el requisito.',
          ],
        },
        {
          title: 'Ruta Cukies Originales',
          text: 'La ruta NFT usa puntos de Cukies Originales según rareza.',
          table: {
            headers: ['Rareza', 'Puntos'],
            rows: [
              ['Común', '1'],
              ['No Común', '2'],
              ['Raro', '4'],
              ['Épico', '7'],
              ['Legendario', '10'],
              ['Goat', '15'],
            ],
          },
        },
        {
          title: 'Requisito dinámico',
          bullets: [
            'Si una ruta llena sus cupos y se decide no abrir más, el requisito puede subir.',
            'La UI debe mostrar requisito anterior, nuevo requisito y cupos que se conservan.',
            'Cuando el requisito sube, hay una ventana de 48 horas para ajustar staking.',
          ],
        },
        {
          title: 'Créditos de competición',
          bullets: [
            'Cada cupo activo recibe 100 créditos diarios.',
            'La primera asignación exige ser Cukie Master al menos 24 horas.',
            'Los créditos pueden usarse para jugar o aportarse al pool de créditos.',
          ],
        },
      ]}
      note="Cukie Master no debe comunicarse como rentabilidad garantizada. La UI debe hablar de cupos, créditos, reglas vigentes, estimaciones y estados pendientes."
    />
  );
}
