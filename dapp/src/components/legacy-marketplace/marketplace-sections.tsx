'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type MarketplaceTab = 'buy' | 'sell';

const TAB_HASH: Record<MarketplaceTab, string> = {
  buy: '#cukies-disponibles',
  sell: '#mis-anuncios',
};

function tabForHash(hash: string): MarketplaceTab {
  return hash === '#mis-anuncios' ? 'sell' : 'buy';
}

function writeTabHash(tab: MarketplaceTab) {
  if (typeof window === 'undefined') return;
  const nextHash = TAB_HASH[tab];
  if (window.location.hash === nextHash) return;
  window.history.pushState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
}

export function MarketplaceSections({
  buy,
  sell,
}: {
  buy: ReactNode;
  sell: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('buy');

  const syncFromLocation = useCallback(() => {
    if (typeof window === 'undefined') return;
    setActiveTab(tabForHash(window.location.hash));
  }, []);

  useEffect(() => {
    syncFromLocation();
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, [syncFromLocation]);

  function selectTab(value: string) {
    const tab = value as MarketplaceTab;
    if (tab !== 'buy' && tab !== 'sell') return;
    setActiveTab(tab);
    writeTabHash(tab);
  }

  return (
    <Tabs value={activeTab} onValueChange={selectTab} className="min-w-0">
      <TabsList
        aria-label="Secciones del marketplace"
        className="grid h-auto w-full min-w-0 grid-cols-2 gap-1 rounded-[12px] border border-white/10 bg-black/25 p-1"
      >
        <TabsTrigger
          value="buy"
          className="min-h-11 min-w-0 rounded-[9px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac-soft)] data-[state=active]:text-[var(--uki-cream)] sm:text-sm"
        >
          Comprar
        </TabsTrigger>
        <TabsTrigger
          value="sell"
          className="min-h-11 min-w-0 rounded-[9px] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--uki-muted)] focus-visible:ring-[var(--uki-lilac)] data-[state=active]:bg-[var(--uki-lilac-soft)] data-[state=active]:text-[var(--uki-cream)] sm:text-sm"
        >
          Mis anuncios
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="buy"
        forceMount
        hidden={activeTab !== 'buy'}
        className="mt-6 min-w-0 data-[state=inactive]:hidden"
      >
        {buy}
      </TabsContent>
      <TabsContent
        value="sell"
        forceMount
        hidden={activeTab !== 'sell'}
        className="mt-6 min-w-0 data-[state=inactive]:hidden"
      >
        {sell}
      </TabsContent>
    </Tabs>
  );
}
