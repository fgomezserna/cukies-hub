import Link from 'next/link';
import {
  ArrowRight,
  ArrowRightLeft,
  Baby,
  Coins,
  Cookie,
  Network,
  Sparkles,
  Store,
  Tag,
  WalletCards,
} from 'lucide-react';

import { listCukiePoints, listCukies } from '@/lib/cukies-data/data';

const tools = [
  {
    title: 'Marketplace',
    href: '/marketplace',
    description: 'Empieza aqui si quieres comprar, revisar precios o abrir la ficha de un NFT concreto.',
    Icon: Store,
    action: 'Abrir marketplace',
    status: 'Compra y gestion',
  },
  {
    title: 'Bridge',
    href: '/bridge',
    description: 'Mueve un Cukie entre TRON y BSC, revisando primero wallet origen, destino y coste.',
    Icon: ArrowRightLeft,
    action: 'Abrir bridge',
    status: 'TRON <-> BSC',
  },
  {
    title: 'CukiePoints',
    href: '/cukiepoints',
    description: 'Comprueba saldo por wallet, actividad global y movimientos ligados a mint o breeding.',
    Icon: Coins,
    action: 'Ver puntos',
    status: 'Lectura y auditoria',
  },
  {
    title: 'Breeding',
    href: '/breeding',
    description: 'Selecciona dos Cukies, valida coste y revisa las crias activas o listas para abrir.',
    Icon: Baby,
    action: 'Abrir breeding',
    status: 'Crear nuevos Cukies',
  },
] as const;

const highlights = [
  'Marketplace es el punto de entrada para inspeccionar y comprar.',
  'Bridge y breeding requieren conectar la wallet correcta antes de operar.',
  'CukiePoints sirve para verificar actividad antes y despues de acciones.',
] as const;

const flow = [
  { label: 'Comprar', detail: 'Marketplace' },
  { label: 'Mover', detail: 'Bridge' },
  { label: 'Criar', detail: 'Breeding' },
  { label: 'Auditar', detail: 'CukiePoints' },
] as const;

function formatMetric(value: number) {
  return value.toLocaleString('en-US');
}

export default async function CukiesToolsPage() {
  const [allCukies, onSaleCukies, bridgeCukies, points] = await Promise.all([
    listCukies({ limit: 1 }),
    listCukies({ limit: 1, state: 'onSale' }),
    listCukies({ limit: 1, state: 'inBridge' }),
    listCukiePoints({ limit: 1 }),
  ]);

  const networks = allCukies.facets.networks
    .map((facet) => `${facet.value} ${formatMetric(facet.count)}`)
    .join(' · ');
  const networkCount = allCukies.facets.networks.length;

  const metrics = [
    {
      label: 'Cukies',
      value: formatMetric(allCukies.total),
      helper: 'coleccion total',
      detail: 'inventario agregado',
      Icon: Cookie,
    },
    {
      label: 'En venta',
      value: formatMetric(onSaleCukies.total),
      helper: 'listados ahora',
      detail: 'disponibles para compra',
      Icon: Tag,
    },
    {
      label: 'Bridge',
      value: formatMetric(bridgeCukies.total),
      helper: 'en movimiento',
      detail: 'pendientes de salida',
      Icon: ArrowRightLeft,
    },
    {
      label: 'Redes',
      value: networkCount > 0 ? formatMetric(networkCount) : '2',
      helper: 'inventario vivo',
      detail: networks || 'TRON · BSC',
      Icon: Network,
    },
    {
      label: 'CukiePoints',
      value: formatMetric(points.summary.totalPoints),
      helper: `${formatMetric(points.summary.totalTransactions)} movimientos`,
      detail: 'actividad historica',
      Icon: Sparkles,
    },
  ] as const;

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-7xl flex-col gap-6 overflow-hidden text-foreground">
      <section className="overflow-hidden rounded-[8px] border border-cyan-300/20 bg-black/35 p-5 shadow-xl shadow-cyan-950/20 backdrop-blur sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-100">
              <Cookie className="h-3.5 w-3.5" />
              Cukies NFT tools
            </div>
            <h1 className="font-headline text-4xl font-bold leading-tight text-white sm:text-5xl">
              Cukies
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Panel operativo para decidir que hacer con tu coleccion: comprar,
              mover entre redes, criar nuevos Cukies o verificar puntos y actividad.
            </p>
          </div>

          <div className="grid gap-2 rounded-[8px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            {highlights.map((item) => (
              <div key={item} className="flex items-start gap-2">
                <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {flow.map((item, index) => (
          <div
            key={item.label}
            className="rounded-[8px] border border-white/10 bg-black/25 p-4"
          >
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[8px] bg-cyan-300 text-sm font-black text-slate-950">
              {index + 1}
            </div>
            <p className="font-headline text-lg font-bold text-white">{item.label}</p>
            <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, helper, detail, Icon }) => (
          <div
            key={label}
            className="rounded-[8px] border border-white/10 bg-black/30 p-4 backdrop-blur"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[8px] bg-cyan-300/10 text-cyan-200">
              <Icon className="h-4 w-4" />
            </div>
            <p className="truncate font-headline text-2xl font-bold text-white">
              {value}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-1 text-sm text-slate-400">{helper}</p>
            <p className="mt-2 truncate text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tools.map(({ title, href, description, Icon, action, status }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-[15rem] flex-col justify-between rounded-[8px] border border-white/10 bg-black/30 p-5 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-950/20"
          >
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[8px] bg-cyan-300/10 text-cyan-200">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="font-headline text-2xl font-bold text-white">
                {title}
              </h2>
              <p className="mt-2 inline-flex rounded-[6px] border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                {status}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {description}
              </p>
            </div>

            <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100">
              {action}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
