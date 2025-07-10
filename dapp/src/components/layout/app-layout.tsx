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
import hyppieletters from '@/assets/hyppieletters.png';
import hyppieicon from '@/assets/dice-512.png';
import { usePathname } from 'next/navigation';

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-full bg-background relative">
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-green-500/20 bg-black/10 backdrop-blur-md shadow-xl shadow-green-500/10" style={{
            // Override sidebar background variable for transparency
            // 25% opaque black provides dark overlay while showing content background
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            "--sidebar-background": "rgb(255, 255, 255)",
            "--sidebar-border": "rgba(16,185,129,0.3)"
          } as React.CSSProperties}>
          <SidebarHeader className="border-b border-green-500/20 bg-black/15 backdrop-blur-sm">
            <div className="flex items-center gap-3 p-1">
                <Image src={hyppieicon} alt="HyppieLiquid" width={39} height={20} />
                <Image src={hyppieletters} alt="HyppieLiquid" height={39} />
            </div>
          </SidebarHeader>
          <SidebarContent className="py-4 bg-black/10 backdrop-blur-sm">
            <SidebarMenu className="px-3 space-y-1">
              <SidebarMenuItem>
                <Link href="/" passHref>
                  <SidebarMenuButton
                    isActive={pathname === '/'}
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-green-500/10 hover:to-emerald-500/10 hover:border-green-400/30 hover:shadow-md hover:shadow-green-500/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/20 data-[active=true]:border-green-400/50"
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
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-green-500/10 hover:to-emerald-500/10 hover:border-green-400/30 hover:shadow-md hover:shadow-green-500/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/20 data-[active=true]:border-green-400/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-400/20 to-emerald-500/20 group-hover:from-green-400/30 group-hover:to-emerald-500/30 transition-all">
                        <Gamepad2 className="h-4 w-4 text-green-400 group-hover:text-emerald-400 transition-colors" />
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
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-green-500/10 hover:to-emerald-500/10 hover:border-green-400/30 hover:shadow-md hover:shadow-green-500/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/20 data-[active=true]:border-green-400/50"
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
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-green-500/10 hover:to-emerald-500/10 hover:border-green-400/30 hover:shadow-md hover:shadow-green-500/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/20 data-[active=true]:border-green-400/50"
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
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-green-500/10 hover:to-emerald-500/10 hover:border-green-400/30 hover:shadow-md hover:shadow-green-500/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/20 data-[active=true]:border-green-400/50"
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
                    className="group relative rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-green-500/10 hover:to-emerald-500/10 hover:border-green-400/30 hover:shadow-md hover:shadow-green-500/20 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/20 data-[active=true]:border-green-400/50"
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
            </SidebarMenu>
            

          </SidebarContent>
          <SidebarFooter className="border-t border-green-500/20 bg-black/15 backdrop-blur-sm">
            <div className="p-3 flex flex-col gap-3 group-data-[collapsible=icon]:items-center">

                <SidebarMenu className="group-data-[collapsible=icon]:items-center space-y-1">
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="group rounded-xl transition-all duration-300 hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-cyan-500/10 hover:shadow-md hover:shadow-blue-500/20">
                        <a href="https://x.com/hyppieliquid" target="_blank" rel="noopener noreferrer">
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
                        <a href="https://telegram.org" target="_blank" rel="noopener noreferrer">
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
                        <a href="https://discord.com" target="_blank" rel="noopener noreferrer">
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
          <div className="absolute inset-0 bg-gradient-to-br from-background via-green-950/20 to-green-900/30"></div>
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(34, 197, 94, 0.4) 1px, transparent 0)`,
            backgroundSize: '50px 50px'
          }}></div>
          
          {/* Gaming hexagonal pattern */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2310b981' fill-opacity='0.6'%3E%3Cpath d='M30 3l25.98 15v30L30 63 4.02 48V18z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px'
          }}></div>
          
          {/* Ambient light effects */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-500/8 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
          
          {/* Floating gradients */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-radial from-green-400/20 via-green-500/10 to-transparent rounded-full blur-xl floating"></div>
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-radial from-emerald-400/15 via-emerald-500/8 to-transparent rounded-full blur-xl floating delay-3000"></div>
          </div>
          
          {/* Animated decorative lines */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent transform -rotate-12 animate-pulse"></div>
            <div className="absolute bottom-1/3 right-0 w-full h-px bg-gradient-to-l from-transparent via-emerald-500/20 to-transparent transform rotate-12 animate-pulse delay-1500"></div>
          </div>
          
          {/* Decorative floating particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 left-20 w-2 h-2 bg-green-400/60 rounded-full floating-slow"></div>
            <div className="absolute top-40 right-32 w-1 h-1 bg-emerald-400/40 rounded-full floating-slow delay-2000"></div>
            <div className="absolute bottom-32 left-1/3 w-3 h-3 bg-cyan-400/30 rounded-full floating-slow delay-4000"></div>
            <div className="absolute top-1/2 right-20 w-1.5 h-1.5 bg-green-300/50 rounded-full floating-slow delay-6000"></div>
            <div className="absolute bottom-20 right-1/4 w-2 h-2 bg-emerald-300/40 rounded-full floating-slow delay-8000"></div>
          </div>
          
          {/* Energy waves */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-500/0 via-green-500/30 to-green-500/0 wave-animation"></div>
            <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-l from-emerald-500/0 via-emerald-500/20 to-emerald-500/0 wave-animation delay-4000"></div>
          </div>
          
          <Header />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative z-10">{children}</main>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default AppLayout;
