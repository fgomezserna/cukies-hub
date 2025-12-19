'use client';

import React from 'react';
import Link from 'next/link';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Home,
  Gamepad2,
  Trophy,
  Star,
  Users,
  Coins,
  Send,
} from 'lucide-react';
import Logo from '@/components/icons/logo';
import Header from './header';
import DiscordIcon from '../icons/discord';
import XIcon from '../icons/x-icon';
import Image from 'next/image';
import CukieLogoFirst from '@/assets/Cukie_logo_first.png';
import { usePathname } from 'next/navigation';

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

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-full bg-background relative">
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-pink-600/20 bg-black/10 backdrop-blur-md shadow-xl shadow-pink-600/10" style={{
            // Override sidebar background variable for transparency
            // 25% opaque black provides dark overlay while showing content background
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            "--sidebar-background": "rgb(255, 255, 255)",
            "--sidebar-border": "rgba(236, 72, 153, 0.3)"
          } as React.CSSProperties}>
          <SidebarHeader className="border-b border-pink-600/20 bg-black/15 backdrop-blur-sm h-16 flex items-center">
            <SidebarLogo />
          </SidebarHeader>
          <SidebarContent className="py-4 bg-black/10 backdrop-blur-sm">
            <SidebarMenu className="px-3 space-y-1">
              <SidebarMenuItem>
                <Link href="/" passHref>
                  <SidebarMenuButton
                    isActive={pathname === '/'}
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 hover:border-pink-500/30 hover:shadow-md hover:shadow-pink-600/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink-600/20 data-[active=true]:to-pink-600/20 data-[active=true]:border-pink-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-400/20 to-cyan-500/20 group-hover:from-blue-400/30 group-hover:to-cyan-500/30 transition-all">
                        <Home className="h-4 w-4 text-blue-400 group-hover:text-cyan-400 transition-colors" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden font-medium">Home</span>
                    </div>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <Link href="/games" passHref>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/games')}
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 hover:border-pink-500/30 hover:shadow-md hover:shadow-pink-600/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink-600/20 data-[active=true]:to-pink-600/20 data-[active=true]:border-pink-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-pink-500/20 to-pink-600/20 group-hover:from-pink-500/30 group-hover:to-pink-600/30 transition-all">
                        <Gamepad2 className="h-4 w-4 text-pink-500 group-hover:text-pink-500 transition-colors" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden font-medium">Games</span>
                    </div>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <Link href="/leaderboard" passHref>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/leaderboard')}
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 hover:border-pink-500/30 hover:shadow-md hover:shadow-pink-600/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink-600/20 data-[active=true]:to-pink-600/20 data-[active=true]:border-pink-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-yellow-400/20 to-orange-500/20 group-hover:from-yellow-400/30 group-hover:to-orange-500/30 transition-all">
                        <Trophy className="h-4 w-4 text-yellow-400 group-hover:text-orange-400 transition-colors" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden font-medium">Leaderboard</span>
                    </div>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <Link href="/quests" passHref>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/quests')}
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 hover:border-pink-500/30 hover:shadow-md hover:shadow-pink-600/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink-600/20 data-[active=true]:to-pink-600/20 data-[active=true]:border-pink-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-400/20 to-pink-500/20 group-hover:from-purple-400/30 group-hover:to-pink-500/30 transition-all">
                        <Star className="h-4 w-4 text-purple-400 group-hover:text-pink-400 transition-colors" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden font-medium">Quests</span>
                    </div>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <Link href="/referrals" passHref>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/referrals')}
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 hover:border-pink-500/30 hover:shadow-md hover:shadow-pink-600/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink-600/20 data-[active=true]:to-pink-600/20 data-[active=true]:border-pink-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-400/20 to-blue-500/20 group-hover:from-indigo-400/30 group-hover:to-blue-500/30 transition-all">
                        <Users className="h-4 w-4 text-indigo-400 group-hover:text-blue-400 transition-colors" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden font-medium">Referrals</span>
                    </div>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <Link href="/points" passHref>
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/points')}
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 hover:border-pink-500/30 hover:shadow-md hover:shadow-pink-600/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink-600/20 data-[active=true]:to-pink-600/20 data-[active=true]:border-pink-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400/20 to-yellow-500/20 group-hover:from-amber-400/30 group-hover:to-yellow-500/30 transition-all">
                        <Coins className="h-4 w-4 text-amber-400 group-hover:text-yellow-400 transition-colors" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden font-medium">Points</span>
                    </div>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-pink-600/10 hover:to-pink-600/10 hover:border-pink-500/30 hover:shadow-md hover:shadow-pink-600/20"
                >
                  <a href="https://marketplace.cukies.world/" target="_blank" rel="noopener noreferrer">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400/20 to-teal-500/20 group-hover:from-emerald-400/30 group-hover:to-teal-500/30 transition-all">
                        <Coins className="h-4 w-4 text-emerald-400 group-hover:text-teal-300 transition-colors" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden font-medium">Marketplace</span>
                    </div>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            

          </SidebarContent>
          <SidebarFooter className="border-t border-pink-600/20 bg-black/15 backdrop-blur-sm">
            <div className="p-3 flex flex-col gap-3 group-data-[collapsible=icon]:items-center">

                <SidebarMenu className="group-data-[collapsible=icon]:items-center space-y-1">
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="group rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-cyan-500/10 hover:shadow-md hover:shadow-blue-500/20">
                        <a href="https://x.com/cukiesworld" target="_blank" rel="noopener noreferrer">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-400/20 to-cyan-500/20 group-hover:from-blue-400/30 group-hover:to-cyan-500/30 transition-all">
                              <XIcon className="h-3 w-3 text-blue-400 group-hover:text-cyan-400 transition-colors" />
                            </div>
                            <span className="group-data-[collapsible=icon]:hidden font-medium text-sm">Twitter</span>
                          </div>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="group rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-indigo-500/10 hover:shadow-md hover:shadow-blue-500/20">
                        <a href="https://t.me/Cukies World" target="_blank" rel="noopener noreferrer">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-400/20 to-indigo-500/20 group-hover:from-blue-400/30 group-hover:to-indigo-500/30 transition-all">
                              <Send className="h-3 w-3 text-blue-400 group-hover:text-indigo-400 transition-colors" />
                            </div>
                            <span className="group-data-[collapsible=icon]:hidden font-medium text-sm">Telegram</span>
                          </div>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="group rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-purple-500/10 hover:to-indigo-500/10 hover:shadow-md hover:shadow-purple-500/20">
                        <a href="https://discord.gg/BxFxZZeAAj" target="_blank" rel="noopener noreferrer">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-400/20 to-indigo-500/20 group-hover:from-purple-400/30 group-hover:to-indigo-500/30 transition-all">
                              <DiscordIcon className="h-3 w-3 text-purple-400 group-hover:text-indigo-400 transition-colors" />
                            </div>
                            <span className="group-data-[collapsible=icon]:hidden font-medium text-sm">Discord</span>
                          </div>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Main background with gradients and textures */}
          <div className="absolute inset-0 bg-gradient-to-br from-background via-pink-950/20 to-pink-900/30"></div>
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(236, 72, 153, 0.4) 1px, transparent 0)`,
            backgroundSize: '50px 50px'
          }}></div>
          
          {/* Gaming hexagonal pattern */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ec4899' fill-opacity='0.6'%3E%3Cpath d='M30 3l25.98 15v30L30 63 4.02 48V18z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px'
          }}></div>
          
          {/* Ambient light effects */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-pink-600/8 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
          
          {/* Floating gradients */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-radial from-pink-500/20 via-pink-600/10 to-transparent rounded-full blur-xl floating"></div>
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-radial from-pink-500/15 via-pink-600/8 to-transparent rounded-full blur-xl floating delay-3000"></div>
          </div>
          
          {/* Animated decorative lines */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-pink-600/30 to-transparent transform -rotate-12 animate-pulse"></div>
            <div className="absolute bottom-1/3 right-0 w-full h-px bg-gradient-to-l from-transparent via-pink-600/20 to-transparent transform rotate-12 animate-pulse delay-1500"></div>
          </div>
          
          {/* Decorative floating particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 left-20 w-2 h-2 bg-pink-500/60 rounded-full floating-slow"></div>
            <div className="absolute top-40 right-32 w-1 h-1 bg-pink-500/40 rounded-full floating-slow delay-2000"></div>
            <div className="absolute bottom-32 left-1/3 w-3 h-3 bg-cyan-400/30 rounded-full floating-slow delay-4000"></div>
            <div className="absolute top-1/2 right-20 w-1.5 h-1.5 bg-pink-400/50 rounded-full floating-slow delay-6000"></div>
            <div className="absolute bottom-20 right-1/4 w-2 h-2 bg-pink-400/40 rounded-full floating-slow delay-8000"></div>
          </div>
          
          {/* Energy waves */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-600/0 via-pink-600/30 to-pink-600/0 wave-animation"></div>
            <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-l from-pink-600/0 via-pink-600/20 to-pink-600/0 wave-animation delay-4000"></div>
          </div>
          
          <Header />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative z-10">{children}</main>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default AppLayout;
