import { ChevronDown } from 'lucide-react';

import { Panel } from '@/components/landing/primitives';

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
      'La participación en votaciones o gobernanza todavía no está habilitada en esta fase de Stage.',
    ],
  },
  {
    question: '¿El requisito Cukie Master es el mismo que el de Treasure Hunt?',
    answer: [
      'No. Cukie Master usa UKI pendientes de vesting más UKI en staking y parte de 20.000 UKI por cupo.',
      'Treasure Hunt usa exclusivamente UKI confirmados en staking y concede una partida por cada 2.000 UKI completos durante la campaña configurada.',
    ],
  },
] as const;

export function CukieMasterFaq() {
  return (
    <section
      id="preguntas-cukie-master"
      aria-labelledby="preguntas-cukie-master-title"
      className="uki-container relative z-[2] min-w-0 scroll-mt-28 pb-14"
    >
      <Panel className="min-w-0" innerClassName="min-w-0 p-5 sm:p-7">
        <p className="uki-label">Antes de hacer staking</p>
        <h2
          id="preguntas-cukie-master-title"
          className="mt-2 font-headline text-2xl font-black uppercase text-[var(--uki-cream)] sm:text-3xl"
        >
          Preguntas frecuentes
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
          Reglas vigentes de la ruta UKI en Stage. Las cifras personales siempre proceden del
          estado verificado, no de una estimación del navegador.
        </p>

        <div className="mt-6 divide-y divide-white/10 overflow-hidden rounded-[10px] border border-white/10 bg-black/20">
          {FAQS.map((item) => (
            <details key={item.question} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-left sm:px-5">
                <span className="font-headline text-base font-black text-[var(--uki-cream)] sm:text-lg">
                  {item.question}
                </span>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-[var(--uki-cyan)] transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-3 border-t border-white/10 px-4 py-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)] sm:px-5">
                {item.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </details>
          ))}
        </div>
      </Panel>
    </section>
  );
}
