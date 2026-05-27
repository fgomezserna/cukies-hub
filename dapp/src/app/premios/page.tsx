import type { Metadata } from 'next';
import { LaunchInfoPage } from '@/components/launch/info-page';
import { PresaleReferralLinkPanel } from '@/components/landing/presale-referral-link-panel';

export const metadata: Metadata = {
  title: 'Premios de preventa | Cukies World',
  description: 'Sorteos de Cukies por compra de UKI y competición de referidos de la preventa.',
};

export default function PremiosPage() {
  return (
    <LaunchInfoPage
      eyebrow="Preventa UKI"
      title="Premios y referidos"
      subtitle="Participa en la preventa, compra UKI, invita a otros sponsors y entra en sorteos de Cukies por tramos de compra y volumen recomendado."
      heroImage="/brand/generated/uki-treasure-hunt-scene-v2.png"
      heroAlt="Escena de Cukies World con premios y tesoro"
      primaryCta={{ label: 'Comprar UKI', href: '/#presale-console' }}
      secondaryCta={{ label: 'Conseguir link', href: '#invitacion' }}
      metrics={[
        { label: 'Compra mínima', value: '10,000 UKI', helper: 'Primer tramo de sorteo' },
        { label: 'Tramo máximo', value: '150,000 UKI', helper: '+1 ticket adicional en cada sorteo desde aquí' },
        { label: 'Sponsors top', value: 'Top 5', helper: 'Cukie garantizado por ranking' },
        { label: 'Referidos', value: '5,000 UKI', helper: '1 ticket por cada volumen recomendado' },
      ]}
      sections={[
        {
          title: 'Sorteos por comprar UKI',
          text: 'Cada tramo abre participación en sorteos de Cukies. Todos los Cukies sorteados son de primera generación salvo cuando se indique segunda generación.',
          table: {
            headers: ['Compra', 'Premio'],
            rows: [
              ['10,000 UKI', 'Sorteo 10 Cukies 2ª Generación, rarezas variadas'],
              ['30,000 UKI', 'Sorteo 5 Cukies Common'],
              ['50,000 UKI', 'Sorteo 2 Cukies Rare + 3 Cukies Uncommon'],
              ['80,000 UKI', 'Sorteo 1 Cukie Epic + 2 Cukies Rare + 2 Cukies Uncommon'],
              ['125,000 UKI', 'Sorteo 1 Cukie Legendary + 3 Cukies Epic'],
              ['150,000 UKI', 'Sorteo 1 Cukie Goat + 3 Cukies Legendary'],
            ],
          },
        },
        {
          title: 'Notas de compra',
          bullets: [
            'A partir de 150,000 UKI recibes 1 ticket adicional para cada uno de los sorteos.',
            'Los tramos y tickets se calculan sobre la wallet que participa en la preventa.',
            'Los premios no sustituyen la utilidad de UKI: son incentivos adicionales de lanzamiento.',
          ],
        },
        {
          title: 'Competición de referidos',
          text: 'Los 5 mejores sponsors reciben un Cukie garantizado según ranking y volumen recomendado.',
          table: {
            headers: ['Posición', 'Premio'],
            rows: [
              ['1º', 'Goat si refiere 2,500,000 UKI+, Legendary si refiere 1,000,000 UKI+, si no Epic'],
              ['2º - 3º', 'Legendary con 1,000,000 UKI+, Epic con 500,000 UKI+, si no Rare'],
              ['4º', 'No Común'],
              ['5º', 'Común'],
            ],
          },
        },
        {
          title: 'Sorteo para el resto',
          bullets: [
            'El resto de participantes entra en el sorteo de 10 Cukies de 2ª Generación.',
            'Cada 5,000 UKI recomendados suma 1 ticket para el sorteo.',
            'El segundo y tercer clasificado reciben como mínimo una rareza inferior a la del primer clasificado.',
          ],
        },
      ]}
      afterSections={
        <section id="invitacion" className="uki-container relative z-[2] grid scroll-mt-28 gap-4 pb-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="uki-launch-badge">Invitaciones</p>
            <h2 className="mt-4 font-headline text-3xl font-black uppercase leading-tight text-[var(--uki-cyan)] sm:text-4xl">
              Consigue tu link de invitación
            </h2>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Si no tienes wallet conectada, primero te pedirá conectarla. Si ya has conectado wallet pero no existe compra mínima, te indicará cuánto UKI falta. Cuando la compra mínima esté confirmada, verás tu link para copiarlo.
            </p>
          </div>
          <PresaleReferralLinkPanel />
        </section>
      }
      note="La mecánica final de elegibilidad, desempates y entrega de premios debe publicarse junto a las reglas oficiales de la preventa."
    />
  );
}
