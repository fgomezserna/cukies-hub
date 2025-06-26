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

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-screen w-full bg-background">
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <Logo />
              <span className="text-lg font-semibold font-headline group-data-[collapsible=icon]:hidden">HyppieLiquid</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="p-2">
              <SidebarMenuItem>
                <Link href="/" passHref>
                  <SidebarMenuButton>
                    <Home />
                    <span className="group-data-[collapsible=icon]:hidden">Home</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/games" passHref>
                  <SidebarMenuButton>
                    <Gamepad2 />
                    <span className="group-data-[collapsible=icon]:hidden">Games</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/leaderboard" passHref>
                  <SidebarMenuButton>
                    <Trophy />
                    <span className="group-data-[collapsible=icon]:hidden">Leaderboard</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/quests" passHref>
                  <SidebarMenuButton>
                    <Star />
                    <span className="group-data-[collapsible=icon]:hidden">Quests</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/referrals" passHref>
                  <SidebarMenuButton>
                    <Users />
                    <span className="group-data-[collapsible=icon]:hidden">Referrals</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/points" passHref>
                  <SidebarMenuButton>
                    <Coins />
                    <span className="group-data-[collapsible=icon]:hidden">Points</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <div className="p-2 flex flex-col gap-1 group-data-[collapsible=icon]:items-center">
                <div className="px-2 text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">Community</div>
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="https://x.com/hyppieliquid" target="_blank" rel="noopener noreferrer">
                          <XIcon className="h-3 w-3" />
                          <span className="group-data-[collapsible=icon]:hidden">Twitter</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="https://telegram.org" target="_blank" rel="noopener noreferrer">
                          <Send />
                          <span className="group-data-[collapsible=icon]:hidden">Telegram</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="https://discord.com" target="_blank" rel="noopener noreferrer">
                          <DiscordIcon />
                          <span className="group-data-[collapsible=icon]:hidden">Discord</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default AppLayout;
