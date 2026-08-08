import type { Metadata } from 'next';
import { CompetitionCreditPanel } from '@/components/cukie-master/credit-panel';
import { CukieMasterWorkspace } from '@/components/cukie-master/workspace';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { UKI_PRESALE_CHAIN_LABEL } from '@/components/landing/sale-config';

export const metadata: Metadata = {
  title: 'Cukie Master | Cukies World',
  description: 'Requisitos, cupos y créditos de competición para Cukie Master.',
};

export const dynamic = 'force-dynamic';

export default function CukieMasterPage() {
  const creditsEnabled = process.env.COMPETITION_CREDITS_RUNTIME_ENABLED?.trim().toLowerCase() === 'true';
  const isStaging = process.env.APP_ENV?.trim().toLowerCase() === 'staging';

  return (
    <LaunchInfoPage
      variant="workspace"
      eyebrow={`${isStaging ? 'Área de pruebas' : 'Red configurada'} · ${UKI_PRESALE_CHAIN_LABEL}`}
      title="Cukie Master"
      subtitle="Comprueba primero qué activos ya te cuentan. Después completa lo que te falte con UKI o Cukies Originales, sin hacer staking innecesario."
      heroImage="/brand/generated/uki-cukie-master-scene-v2.png"
      heroAlt="Escena Cukie Master con token UKI y bóveda"
      primaryCta={{ label: 'Ver mi estado', href: '#mi-estado' }}
      secondaryCta={{ label: 'Cómo funciona', href: '#como-funciona' }}
      metrics={[
        { label: 'Ruta UKI', value: '20.000 UKI', helper: 'Requisito inicial por cupo' },
        { label: 'Ruta Cukies', value: '3 puntos', helper: 'Requisito inicial por cupo' },
        { label: 'Límite por wallet', value: '10 cupos', helper: 'Máximo 5 por cada ruta' },
        { label: 'Validación inicial', value: '24 horas', helper: 'Antes de que un cupo pase a activo' },
      ]}
      beforeSections={<CukieMasterWorkspace testnetOnly={isStaging} />}
      afterSections={creditsEnabled ? <CompetitionCreditPanel /> : undefined}
      sections={[
        {
          title: 'Ruta UKI',
          text: 'Los UKI de preventa que siguen en vesting ya cuentan. Solo necesitas añadir staking si aún te falta cantidad para el siguiente cupo.',
          bullets: [
            'Se suman los UKI en vesting y los UKI depositados en staking.',
            'El panel muestra la suma completa y el déficit exacto para el siguiente cupo.',
            'Puedes retirar UKI, pero tus cupos se recalcularán con la nueva cantidad.',
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
            'Si una ruta completa su capacidad, el requisito de entrada puede actualizarse.',
            'Verás el requisito vigente, cualquier cambio pendiente y los cupos que conservas.',
            'Si cambia el requisito, tendrás una ventana de 48 horas para ajustar tus activos.',
          ],
        },
        {
          title: 'Créditos de competición',
          bullets: [
            creditsEnabled
              ? 'La asignación de créditos está activa en este entorno y aparecerá debajo de las reglas.'
              : 'La asignación de créditos todavía no está activa en este entorno de pruebas.',
            'Cuando se habilite, solo contarán los cupos que ya hayan pasado a estado activo.',
            'No mostramos saldos ni recompensas estimadas mientras el servicio no está habilitado.',
          ],
        },
      ]}
      note="Cukie Master da acceso a cupos y utilidades dentro del ecosistema. No implica una rentabilidad garantizada. Comprueba siempre el estado y los requisitos vigentes antes de confirmar una operación."
    />
  );
}
