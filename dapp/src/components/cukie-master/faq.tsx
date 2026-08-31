import { Check, ChevronDown } from 'lucide-react';

const FAQS = [
  {
    question: '¿Cuántos cupos de Cukie Master hay disponibles mediante UKI?',
    answer: [
      'La ruta UKI empieza con 500 cupos globales y puede ampliarse progresivamente hasta un máximo de 2.500.',
      'Cada wallet puede mantener como máximo 5 cupos mediante UKI. El requisito inicial es de 20.000 UKI computables por cupo.',
    ],
  },
  {
    question: '¿Qué ocurre cuando se completan los 500 cupos iniciales?',
    answer: [
      'El requisito no sube automáticamente por alcanzar la capacidad. La operación puede ampliar los cupos disponibles o publicar una nueva versión del requisito.',
      'Si se aprueba una subida, las posiciones existentes disponen de una ventana de gracia de 48 horas. Al terminar, cada wallet conserva únicamente los cupos para los que cumpla el nuevo mínimo.',
    ],
  },
  {
    question: '¿Puedo stakear más UKI de los necesarios para proteger mi posición?',
    answer: [
      'Sí. Los UKI adicionales cuentan como margen frente a una futura subida del requisito, aunque no permiten superar el máximo de 5 cupos UKI por wallet.',
      'Los UKI pendientes de vesting y los UKI depositados en staking se suman. Los UKI líquidos de la wallet no cuentan hasta que se depositan.',
    ],
  },
  {
    question: '¿Qué ventajas activas tiene ser Cukie Master?',
    answer: [
      'Cada cupo que haya madurado al menos 24 horas recibe 100 créditos en el corte diario correspondiente.',
      'Puedes reservar esos créditos para jugar o aportar una parte al pool de créditos. Los créditos no equivalen ni garantizan 100 UKI: el resultado depende de partidas válidas y de las reglas económicas vigentes.',
      'La participación en votaciones o gobernanza todavía no está disponible.',
    ],
  },
  {
    question: '¿El requisito Cukie Master es el mismo que el de Treasure Hunt?',
    answer: [
      'No. Cukie Master usa UKI pendientes de vesting más UKI en staking y parte de 20.000 UKI por cupo.',
      'Treasure Hunt usa exclusivamente UKI confirmados en staking y concede una partida por cada 2.000 UKI completos durante la campaña configurada.',
    ],
  },
  {
    question: '¿Cómo funciona la vía con Cukies Originales?',
    answer: [
      'Cada 3 puntos de rareza depositados conceden inicialmente un cupo. Esta vía tiene su propio máximo de 5 cupos y no consume el límite de la vía UKI.',
      'Mientras un Cukie está depositado no puedes jugarlo, venderlo ni transferirlo. Puedes retirarlo cuando quieras y conservar los créditos ya obtenidos.',
    ],
  },
] as const;

const ESSENTIALS = [
  'Tu vesting pendiente y tu staking de UKI se suman automáticamente.',
  'Cada cupo necesita 24 horas antes de su primera entrega de créditos.',
  'Puedes conservar créditos para jugar o aportar una parte al pool.',
] as const;

export function CukieMasterFaq() {
  return (
    <section
      id="preguntas-cukie-master"
      aria-labelledby="preguntas-cukie-master-title"
      className="relative z-[2] mx-auto w-full max-w-[1480px] min-w-0 scroll-mt-24 pb-14"
    >
      <details className="group overflow-hidden rounded-[18px] border border-white/10 bg-black/20">
        <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left sm:px-7">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--uki-lilac)]">Información de apoyo</p>
            <h2
              id="preguntas-cukie-master-title"
              className="mt-1 font-headline text-xl font-black text-[var(--uki-cream)] sm:text-2xl"
            >
              Reglas y preguntas frecuentes
            </h2>
          </div>
          <ChevronDown
            className="h-6 w-6 shrink-0 text-[var(--uki-lilac)] transition-transform duration-300 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="border-t border-white/10 px-5 pb-6 sm:px-7 sm:pb-8">
          <div className="grid divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {ESSENTIALS.map((item) => (
              <div key={item} className="flex gap-3 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--uki-lilac)]" aria-hidden="true" />
                <p className="text-sm font-semibold leading-relaxed text-[var(--uki-text)]">{item}</p>
              </div>
            ))}
          </div>

          <div className="divide-y divide-white/10 border-t border-white/10">
            {FAQS.map((item) => (
              <details key={item.question} className="group/question">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left">
                  <span className="font-headline text-base font-black text-[var(--uki-cream)] sm:text-lg">
                    {item.question}
                  </span>
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-[var(--uki-lilac)] transition-transform group-open/question:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="max-w-4xl space-y-3 pb-5 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                  {item.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </details>
            ))}
          </div>

          <p className="border-t border-white/10 pt-5 text-xs font-semibold leading-relaxed text-[var(--uki-muted)]">
            Comprueba siempre la red, la cantidad y los detalles de la operación antes de confirmar. Ser Cukie Master, aportar al pool o hacer staking no garantiza rentabilidad.
          </p>
        </div>
      </details>
    </section>
  );
}
