import Link from 'next/link';
import type { Sort } from 'mongodb';
import { AlertTriangle, Database, RefreshCw, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getIndexerDb, getIndexerDbName } from '@/lib/indexer-db/mongodb';

export const dynamic = 'force-dynamic';

const preferredCollections = [
  'chain_events',
  'chain_cursors',
  'chain_indexer_runs',
  'chain_dead_letters',
  'card_generation_jobs',
  'cukies',
  'tx_nfts',
  'point_transactions',
  'point_balances',
  'marketplace_listings',
  'bridge_transfers',
];

type PageProps = {
  searchParams?: Promise<{
    collection?: string;
    q?: string;
    limit?: string;
  }>;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serializeDocument(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      return item;
    }),
  );
}

function buildSearchFilter(q: string) {
  const pattern = new RegExp(escapeRegex(q), 'i');

  return {
    $or: [
      { _id: pattern },
      { eventId: pattern },
      { txHash: pattern },
      { transactionId: pattern },
      { eventName: pattern },
      { status: pattern },
      { chain: pattern },
      { contractAlias: pattern },
      { tokenId: pattern },
      { owner: pattern },
      { user: pattern },
      { address: pattern },
      { 'normalized.tokenId': pattern },
      { 'normalized.user': pattern },
      { 'normalized.address': pattern },
    ],
  };
}

function sortForCollection(collection: string): Sort {
  if (collection === 'chain_cursors') return { updatedAt: -1 };
  if (collection === 'chain_indexer_runs') return { startedAt: -1 };
  if (collection === 'card_generation_jobs') return { createdAt: -1 };
  if (collection === 'chain_events') return { timestampMs: -1, blockNumber: -1, logIndex: -1 };
  return { updatedAt: -1, timestampMs: -1, createdAt: -1 };
}

async function getViewerData(collectionName: string, q: string, limit: number) {
  const db = await getIndexerDb();
  const existingCollections = await db.listCollections().toArray();
  const existingNames = existingCollections.map((collection) => collection.name);
  const collectionNames = [
    ...preferredCollections.filter((collection) => existingNames.includes(collection)),
    ...existingNames.filter((collection) => !preferredCollections.includes(collection)),
  ];
  const selectedCollection = collectionNames.includes(collectionName)
    ? collectionName
    : collectionNames[0] ?? 'chain_events';

  const counts = await Promise.all(
    preferredCollections.map(async (collection) => {
      const exists = existingNames.includes(collection);
      return {
        collection,
        count: exists ? await db.collection(collection).countDocuments() : 0,
      };
    }),
  );

  const filter = q.trim() ? buildSearchFilter(q.trim()) : {};
  const documents = existingNames.includes(selectedCollection)
    ? await db
        .collection(selectedCollection)
        .find(filter)
        .sort(sortForCollection(selectedCollection))
        .limit(limit)
        .toArray()
    : [];

  return {
    collectionNames,
    counts,
    selectedCollection,
    documents: documents.map(serializeDocument),
  };
}

export default async function IndexerPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const collection = params.collection ?? 'chain_events';
  const q = params.q ?? '';
  const parsedLimit = Number(params.limit ?? 25);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 5), 100) : 25;

  try {
    const data = await getViewerData(collection, q, limit);

    return (
      <main className="min-h-screen overflow-y-auto bg-background px-5 py-6 text-foreground md:px-8">
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-cyan-200">
                <Database className="h-4 w-4" />
                <span>Mongo viewer</span>
                <Badge variant="outline" className="border-cyan-300/30 text-cyan-100">
                  {getIndexerDbName()}
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-normal text-white">Chain indexer</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Eventos normalizados, cursors y vistas materializadas generadas en la base nueva.
              </p>
            </div>
            <Button asChild variant="outline" className="w-fit border-cyan-300/30 text-cyan-50">
              <Link href={`/indexer?collection=${data.selectedCollection}&limit=${limit}`}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refrescar
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {data.counts.map((item) => (
              <Link
                key={item.collection}
                href={`/indexer?collection=${item.collection}&limit=${limit}`}
                className={`rounded-[8px] border p-4 transition ${
                  item.collection === data.selectedCollection
                    ? 'border-cyan-300/60 bg-cyan-300/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/30'
                }`}
              >
                <div className="text-xs text-slate-400">{item.collection}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{item.count}</div>
              </Link>
            ))}
          </div>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-xl text-white">{data.selectedCollection}</CardTitle>
                  <CardDescription>
                    Ultimos {limit} documentos{q ? ` filtrados por "${q}"` : ''}.
                  </CardDescription>
                </div>
                <form className="flex w-full gap-2 md:w-[460px]">
                  <input type="hidden" name="collection" value={data.selectedCollection} />
                  <Input name="q" defaultValue={q} placeholder="Buscar tokenId, tx, evento, owner..." />
                  <Button type="submit" variant="outline" className="border-cyan-300/30">
                    <Search className="h-4 w-4" />
                  </Button>
                </form>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.collectionNames.map((name) => (
                  <Button
                    key={name}
                    asChild
                    size="sm"
                    variant={name === data.selectedCollection ? 'default' : 'outline'}
                    className={name === data.selectedCollection ? '' : 'border-white/15'}
                  >
                    <Link href={`/indexer?collection=${name}&q=${encodeURIComponent(q)}&limit=${limit}`}>
                      {name}
                    </Link>
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="w-[260px]">Documento</TableHead>
                    <TableHead>Contenido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.documents.map((document) => (
                    <TableRow key={String(document._id)} className="border-white/10">
                      <TableCell className="align-top">
                        <div className="font-mono text-xs text-cyan-100">{String(document._id)}</div>
                        {'eventName' in document && (
                          <Badge variant="outline" className="mt-2 border-white/15 text-slate-200">
                            {String(document.eventName)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <pre className="max-h-[360px] overflow-auto rounded-[8px] bg-black/35 p-3 text-xs leading-relaxed text-slate-200">
                          {JSON.stringify(document, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.documents.length === 0 && (
                    <TableRow className="border-white/10">
                      <TableCell colSpan={2} className="py-10 text-center text-slate-400">
                        No hay documentos para esta vista.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return (
      <main className="min-h-screen bg-background px-5 py-6 text-foreground md:px-8">
        <section className="mx-auto max-w-3xl rounded-[8px] border border-red-300/30 bg-red-950/20 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-5 w-5 text-red-200" />
            <div>
              <h1 className="text-xl font-semibold text-white">No se pudo abrir el viewer</h1>
              <p className="mt-2 text-sm text-red-100">{message}</p>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
