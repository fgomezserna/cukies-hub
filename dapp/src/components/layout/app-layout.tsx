'use client';

import React from 'react';
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
  Trophy,
  LockKeyhole,
  Crown,
} from 'lucide-react';
import Header from './header';
import Image from 'next/image';
import CukieLogoFirst from '@/assets/Cukie_logo_first.png';
import { usePathname } from 'next/navigation';
import { useMobileGameShell } from '@/hooks/use-mobile-game-shell';
import { cn } from '@/lib/utils';

const SidebarLogo = () => {
  return (
    <div className="flex items-center justify-center w-full h-full px-2 py-1">
      <Image 
        src={CukieLogoFirst} 
        alt="Cukies World" 
        width={200} 
        height={48}
        className="object-contain max-w-[200px] max-h-[56px] w-auto h-auto"
      />
    </div>
  );
};

const SidebarNavigationLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<typeof Link>
>(({ onClick, ...props }, ref) => {
  const { setOpenMobile } = useSidebar();

  return (
    <Link
      ref={ref}
      onClick={(event) => {
        onClick?.(event);
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
  const isTreasureHunt = pathname.startsWith('/games/treasure-hunt');
  const isTreasureHuntGameView = pathname === '/games/treasure-hunt';
  const isTreasureHuntRanking = pathname.startsWith('/games/treasure-hunt/rankings');
  const isMobileTreasureHunt =
    isMobileGameShell && isTreasureHuntGameView;
  const isMarketplaceSection = pathname.startsWith('/marketplace');

  const navigationGroups = [
    {
      label: 'Resumen',
      items: [{
        href: '/dashboard',
        label: 'Dashboard',
        Icon: LayoutDashboard,
        active: pathname === '/dashboard',
      }],
    },
    {
      label: 'Recursos',
      items: [
        {
          href: '/games/treasure-hunt',
          label: 'Jugar',
          Icon: Gamepad2,
          active: isTreasureHuntGameView,
        },
        {
          href: '/cukie-master',
          label: 'Cukie Master',
          Icon: Crown,
          active: pathname.startsWith('/cukie-master'),
        },
        {
          href: '/cukie-hodler#mi-cukie-pool',
          label: 'Pool de Cukies',
          Icon: Layers3,
          active: pathname.startsWith('/cukie-hodler'),
        },
      ],
    },
    {
      label: 'Activos',
      items: [
        {
          href: '/cukies',
          label: 'Cukies',
          Icon: Cookie,
          active: pathname.startsWith('/cukies'),
        },
        {
          href: '/marketplace',
          label: 'Marketplace',
          Icon: Store,
          active: pathname.startsWith('/marketplace'),
        },
      ],
    },
    {
      label: 'Recompensas',
      items: [{
        href: '/games/treasure-hunt/rankings',
        label: 'Ranking',
        Icon: Trophy,
        active: isTreasureHuntRanking,
      }],
    },
    {
      label: 'Externo',
      items: [{
        href: '/vesting',
        label: 'Vesting',
        Icon: LockKeyhole,
        active: pathname === '/vesting',
      }],
    },
  ];

  return (
    <div className="relative flex h-screen h-dvh min-h-0 w-full overflow-hidden bg-background">
      <SidebarProvider
        className={cn(isMobileTreasureHunt && 'h-full min-h-0 overflow-hidden')}
      >
        {!isMobileTreasureHunt && (
        <Sidebar collapsible="icon" className="border-r border-teal-400/20 bg-black/10 backdrop-blur-md shadow-xl shadow-teal-400/10" style={{
            // Override sidebar background variable for transparency
            // 25% opaque black provides dark overlay while showing content background
            "--sidebar-background": "rgb(255, 255, 255)",
            "--sidebar-border": "rgba(34, 231, 223, 0.3)"
          } as React.CSSProperties}>
          <SidebarHeader className="border-b border-teal-400/20 bg-black/15 backdrop-blur-sm h-16 flex items-center">
            <SidebarLogo />
          </SidebarHeader>
          <SidebarContent className="bg-black/10 py-2 backdrop-blur-sm">
            {navigationGroups.map((group) => (
              <SidebarGroup key={group.label} className="px-3 py-1">
                <SidebarGroupLabel className="px-2 font-black uppercase tracking-[0.1em] text-cyan-100/55">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {group.items.map(({ href, label, Icon, active }) => (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={label}
                          className="group relative rounded-xl transition-all duration-300 hover:border-cyan-300/30 hover:bg-gradient-to-r hover:from-teal-400/10 hover:to-teal-400/10 hover:shadow-md hover:shadow-teal-400/20 data-[active=true]:border-cyan-300/50 data-[active=true]:bg-gradient-to-r data-[active=true]:from-teal-400/20 data-[active=true]:to-teal-400/20"
                        >
                          <SidebarNavigationLink href={href}>
                            <div className="flex items-center gap-3">
                              <div className="rounded-lg bg-gradient-to-br from-teal-400/20 to-cyan-400/20 p-1.5 transition-all group-hover:from-teal-400/30 group-hover:to-cyan-400/30">
                                <Icon className="h-4 w-4 text-cyan-300 transition-colors group-hover:text-cyan-200" />
                              </div>
                              <span className="font-medium group-data-[collapsible=icon]:hidden">
                                {label}
                              </span>
                            </div>
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
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Main background with gradients and textures */}
          <div className="absolute inset-0 bg-gradient-to-br from-background via-cyan-950/20 to-cyan-950/30"></div>
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(34, 231, 223, 0.4) 1px, transparent 0)`,
            backgroundSize: '50px 50px'
          }}></div>
          
          {/* Gaming hexagonal pattern */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2322e7df' fill-opacity='0.6'%3E%3Cpath d='M30 3l25.98 15v30L30 63 4.02 48V18z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px'
          }}></div>
          
          {!isMarketplaceSection && !isTreasureHunt && (
            <div data-app-ambient-effects className="contents">
              {/* Ambient light effects */}
              <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-teal-400/8 rounded-full blur-3xl animate-pulse delay-1000"></div>
              <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
              
              {/* Floating gradients */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-radial from-cyan-300/20 via-teal-400/10 to-transparent rounded-full blur-xl floating"></div>
                <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-radial from-cyan-300/15 via-teal-400/8 to-transparent rounded-full blur-xl floating delay-3000"></div>
              </div>
              
              {/* Animated decorative lines */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-teal-400/30 to-transparent transform -rotate-12 animate-pulse"></div>
                <div className="absolute bottom-1/3 right-0 w-full h-px bg-gradient-to-l from-transparent via-teal-400/20 to-transparent transform rotate-12 animate-pulse delay-1500"></div>
              </div>
              
              {/* Decorative floating particles */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-20 w-2 h-2 bg-cyan-300/60 rounded-full floating-slow"></div>
                <div className="absolute top-40 right-32 w-1 h-1 bg-cyan-300/40 rounded-full floating-slow delay-2000"></div>
                <div className="absolute bottom-32 left-1/3 w-3 h-3 bg-cyan-400/30 rounded-full floating-slow delay-4000"></div>
                <div className="absolute top-1/2 right-20 w-1.5 h-1.5 bg-cyan-200/50 rounded-full floating-slow delay-6000"></div>
                <div className="absolute bottom-20 right-1/4 w-2 h-2 bg-cyan-200/40 rounded-full floating-slow delay-8000"></div>
              </div>
              
              {/* Energy waves */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal-400/0 via-teal-400/30 to-teal-400/0 wave-animation"></div>
                <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-l from-teal-400/0 via-teal-400/20 to-teal-400/0 wave-animation delay-4000"></div>
              </div>
            </div>
          )}
          
          {!isTreasureHuntGameView ? <Header variant="default" /> : null}
          <main
            data-app-main
            className={cn(
              'relative z-10 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-8',
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
