'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Gamepad2,
  Cookie,
  Layers3,
  Store,
  LockKeyhole,
  Crown,
  Coins,
  Gift,
  UsersRound,
} from 'lucide-react';
import Header from './header';
import Image from 'next/image';
import CukieLogoFirst from '@/assets/Cukie_logo_first.png';
import { usePathname } from 'next/navigation';
import { useMobileGameShell } from '@/hooks/use-mobile-game-shell';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { isAmbassadorsPubliclyListed } from '@/lib/public-features';
import { AppRuntimeNotice } from './app-runtime-notice';

const SidebarLogo = () => {
  return (
    <Link
      href="/"
      aria-label="Volver a la landing"
      className="flex h-full w-full items-center justify-center px-2 py-1"
    >
      <Image 
        src={CukieLogoFirst} 
        alt="Cukies World" 
        width={200} 
        height={48}
        className="object-contain max-w-[200px] max-h-[56px] w-auto h-auto"
      />
    </Link>
  );
};

const SidebarNavigationLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<typeof Link> & { onMobileNavigate?: () => void }
>(({ onClick, onMobileNavigate, ...props }, ref) => {
  const { isMobile, setMobileNavigationFocus, setOpenMobile } = useSidebar();

  return (
    <Link
      ref={ref}
      onClick={(event) => {
        onClick?.(event);
        if (isMobile) setMobileNavigationFocus(onMobileNavigate ?? null);
        setOpenMobile(false);
      }}
      {...props}
    />
  );
});
SidebarNavigationLink.displayName = 'SidebarNavigationLink';

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isMobileGameShell = useMobileGameShell();
  const isMobile = useIsMobile();
  const isGamesSection = pathname.startsWith('/games');
  const isTreasureHunt = pathname.startsWith('/games/treasure-hunt');
  const isTreasureHuntGameView = pathname === '/games/treasure-hunt';
  const isMobileTreasureHunt =
    isMobileGameShell && isTreasureHuntGameView;
  const isMarketplaceSection = pathname.startsWith('/marketplace');
  const mainRef = useRef<HTMLElement>(null);

  const focusMainAfterMobileNavigation = React.useCallback(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, []);

  const navigationGroups = [
    {
      label: 'Acceso principal',
      items: [
        { href: '/', label: 'Inicio', Icon: LayoutDashboard, active: false },
        { href: '/dashboard', label: 'Resumen', Icon: LayoutDashboard, active: pathname === '/dashboard' },
        { href: '/games', label: 'Jugar', Icon: Gamepad2, active: isGamesSection },
      ],
    },
    {
      label: 'Recursos',
      items: [
        { href: '/cukie-master', label: 'Cukie Master', Icon: Crown, active: pathname.startsWith('/cukie-master') },
        { href: '/credits', label: 'Créditos', Icon: Coins, active: pathname.startsWith('/credits') },
        { href: '/cukie-hodler#mi-cukie-pool', label: 'Pool de Cukies', Icon: Layers3, active: pathname.startsWith('/cukie-hodler') },
      ],
    },
    {
      label: 'Colección',
      items: [
        { href: '/cukies', label: 'Mis Cukies', Icon: Cookie, active: pathname.startsWith('/cukies') },
        { href: '/marketplace', label: 'Marketplace', Icon: Store, active: pathname.startsWith('/marketplace') },
      ],
    },
    {
      label: 'Cobros',
      items: [
        { href: '/premios', label: 'Premios', Icon: Gift, active: pathname.startsWith('/premios') },
        { href: '/vesting', label: 'Vesting', Icon: LockKeyhole, active: pathname === '/vesting' },
      ],
    },
    ...(isAmbassadorsPubliclyListed()
      ? [{
          label: 'Invitaciones',
          items: [{ href: '/embajadores', label: 'Embajadores', Icon: UsersRound, active: pathname.startsWith('/embajadores') }],
        }]
      : []),
    {
      label: 'Cuenta y ayuda',
      items: [
        { href: '/como-jugar', label: 'Como jugar', Icon: Gamepad2, active: pathname.startsWith('/como-jugar') },
      ],
    },
  ];

  const hasMountedPathRef = useRef(false);

  useEffect(() => {
    if (!hasMountedPathRef.current) {
      hasMountedPathRef.current = true;
      return;
    }

    if (isMobile) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [isMobile, pathname]);

  return (
    <div className="relative flex h-screen h-dvh min-h-0 w-full overflow-hidden bg-[#0b0810]">
      <SidebarProvider
        className={cn(isMobileTreasureHunt && 'h-full min-h-0 overflow-hidden')}
      >
        {!isMobileTreasureHunt && (
        <Sidebar collapsible="icon" className="border-r-0 bg-[#0b0810] shadow-none" style={{
            "--sidebar-background": "#0b0810",
            "--sidebar-border": "transparent",
          } as React.CSSProperties}>
          <SidebarHeader className="flex h-16 items-center border-b border-lilac-400/15 bg-black/10">
            <SidebarLogo />
          </SidebarHeader>
          <SidebarContent className="bg-transparent py-4">
            {navigationGroups.map(({ label, items }) => (
              <SidebarGroup key={label} className="px-3 py-0">
                <SidebarGroupLabel className="px-3 pb-1 pt-3 text-[0.65rem] font-black uppercase tracking-[0.16em] text-white/40 group-data-[collapsible=icon]:hidden">
                  {label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1.5">
                    {items.map(({ href, label: itemLabel, Icon, active }) => (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={itemLabel}
                          className="group min-h-11 rounded-lg border border-transparent text-white/70 transition-colors hover:border-lilac-300/20 hover:bg-lilac-400/10 hover:text-white data-[active=true]:border-lilac-300/30 data-[active=true]:bg-lilac-400/15 data-[active=true]:text-white"
                        >
                          <SidebarNavigationLink
                            href={href}
                            onMobileNavigate={focusMainAfterMobileNavigation}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-lilac-300 transition-colors group-hover:text-lilac-200" />
                            <span className="font-semibold group-data-[collapsible=icon]:hidden">
                              {itemLabel}
                            </span>
                          </SidebarNavigationLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        )}
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0810]">
          {/* Shared application surface: starts with the same tone as the sidebar. */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(228,92,255,0.055),transparent_28rem),linear-gradient(110deg,#0b0810_0%,#0e0a14_58%,#0d0914_100%)]"></div>
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(228, 92, 255, 0.28) 1px, transparent 0)`,
            backgroundSize: '50px 50px'
          }}></div>
          
          {/* Gaming hexagonal pattern */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e45cff' fill-opacity='0.45'%3E%3Cpath d='M30 3l25.98 15v30L30 63 4.02 48V18z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px'
          }}></div>
          
          {!isMarketplaceSection && !isTreasureHunt && (
            <div data-app-ambient-effects className="contents">
              {/* Ambient light effects */}
              <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-lilac-400/8 blur-3xl"></div>
              
              {/* Floating gradients */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -bottom-40 -left-32 h-72 w-72 rounded-full bg-gradient-radial from-lilac-300/10 via-lilac-500/5 to-transparent blur-2xl"></div>
              </div>
              
              {/* Animated decorative lines */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-0 h-px w-full -rotate-12 bg-gradient-to-r from-transparent via-lilac-400/15 to-transparent"></div>
              </div>
              
              {/* Decorative floating particles */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-20 h-1.5 w-1.5 rounded-full bg-lilac-300/40"></div>
                <div className="absolute bottom-20 right-1/4 h-1 w-1 rounded-full bg-lilac-200/30"></div>
              </div>
              
              {/* Energy waves */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-0 left-0 h-px w-full bg-gradient-to-r from-lilac-400/0 via-lilac-400/20 to-lilac-400/0"></div>
              </div>
            </div>
          )}
          
          {!isTreasureHuntGameView ? (
            <Header
              variant="default"
              hideDisconnectedWalletTrigger={pathname.startsWith('/cukie-master')}
            />
          ) : null}
          {!isTreasureHuntGameView ? <AppRuntimeNotice /> : null}
          <main
            data-app-main
            data-testid="app-main"
            ref={mainRef}
            tabIndex={-1}
            className={cn(
              'relative z-10 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 outline-none sm:p-6 lg:p-8',
              isTreasureHunt && 'h-full overflow-hidden p-0 sm:p-0 lg:p-0',
            )}
          >
            {children}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default AppLayout;
