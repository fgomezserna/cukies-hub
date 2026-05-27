import type { Metadata } from 'next';
import { LaunchInfoPage } from '@/components/launch/info-page';

export const metadata: Metadata = {
  title: 'Premios de preventa | Cukies World',
  description: 'Sorteos de Cukies por compra de UKI y competicion de referidos de la preventa.',
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
        { label: 'Compra minima', value: '10,000 UKI', helper: 'Primer tramo de sorteo' },
        { label: 'Tramo maximo', value: '150,000 UKI', helper: '+1 ticket adicional en cada sorteo desde aqui' },
        { label: 'Sponsors top', value: 'Top 5', helper: 'Cukie garantizado por ranking' },
        { label: 'Referidos', value: '5,000 UKI', helper: '1 ticket por cada volumen recomendado' },
      ]}
      sections={[
        {
          title: 'Sorteos por comprar UKI',
          text: 'Cada tramo abre participacion en sorteos de Cukies. Todos los Cukies sorteados son de primera generacion salvo cuando se indique segunda generacion.',
          table: {
            headers: ['Compra', 'Premio'],
            rows: [
              ['10,000 UKI', 'Sorteo 10 Cukies 2a Generacion, rarezas variadas'],
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
          title: 'Competicion de referidos',
          text: 'Los 5 mejores sponsors reciben un Cukie garantizado segun ranking y volumen recomendado.',
          table: {
            headers: ['Posicion', 'Premio'],
            rows: [
              ['1o', 'Goat si refiere 2,500,000 UKI+, Legendary si refiere 1,000,000 UKI+, si no Epic'],
              ['2o - 3o', 'Legendary con 1,000,000 UKI+, Epic con 500,000 UKI+, si no Rare'],
              ['4o', 'No Comun'],
              ['5o', 'Comun'],
            ],
          },
        },
        {
          title: 'Sorteo para el resto',
          bullets: [
            'El resto de participantes entra en el sorteo de 10 Cukies de 2a Generacion.',
            'Cada 5,000 UKI recomendados suma 1 ticket para el sorteo.',
            'El segundo y tercer clasificado reciben como minimo una rareza inferior a la del primer clasificado.',
          ],
        },
        {
          title: 'Consigue tu link de invitacion',
          text: 'Conecta tu wallet para consultar el estado. Si aun no has comprado UKI con esa wallet, primero tendras que participar en la preventa. Cuando exista compra minima registrada, se mostrara tu link de invitacion.',
          bullets: [
            'Sin wallet conectada: conecta una wallet EVM.',
            'Wallet conectada sin compra minima: compra UKI para activar tu link.',
            'Wallet con compra minima: comparte tu link de invitacion.',
          ],
        },
      ]}
      note="La mecanica final de elegibilidad, desempates y entrega de premios debe publicarse junto a las reglas oficiales de la preventa."
    />
  );
}
