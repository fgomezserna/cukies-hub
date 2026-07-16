'use client';

import React, { useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Bell, Wallet, Settings, LogOut, PanelLeft } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/providers/auth-provider';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useAccount, useConnect, useDisconnect, type Connector } from 'wagmi';
import { useTronLink } from '@/hooks/use-tronlink';
import { getVisibleWalletConnectors } from '@/lib/wallet-connectors';
import { HeaderWalletDialog } from '@/components/layout/header-wallet-dialog';
import { cn } from '@/lib/utils';



const ranks = [
  { xp: 50000, name: 'Hyppie Master' },
  { xp: 20000, name: 'Hyperliquid Veteran' },
  { xp: 10000, name: 'Treasure Hunter' },
  { xp: 5000, name: 'Experimented Hyppie' },
  { xp: 2500, name: 'Explorer' },
];

const getRank = (xp: number): string => {
  const userRank = ranks.find(rank => xp >= rank.xp);
  return userRank ? userRank.name : 'Sin rango';
};

interface HeaderProps {
  variant?: 'default' | 'game-overlay';
}

export default function Header({ variant = 'default' }: HeaderProps) {
  const isGameOverlay = variant === 'game-overlay';
  const { toggleSidebar, state, isMobile } = useSidebar();
  const { user, isLoading: isAuthLoading, isWaitingForApproval, fetchUser } = useAuth();
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    address: tronAddress,
    connect: connectTron,
    disconnect: disconnectTron,
    error: tronError,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
    isLoading: isTronLoading,
  } = useTronLink();
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const hasMounted = useHasMounted();
  const evmConnectors = useMemo(
    () => (hasMounted ? getVisibleWalletConnectors(connectors) : []),
    [connectors, hasMounted],
  );
  
  // This would come from user data in a real app
  const userXP = user?.xp ?? 0;
  const userRank = getRank(userXP);

  const handleConnectEVM = async (connector: Connector) => {
    try {
      setIsWalletDialogOpen(false);

      if (isEvmConnected) {
        disconnect();
      }

      if (isTronConnected) {
        disconnectTron();
      }

      const result = await connectAsync({ connector });
      const connectedAddress = result.accounts?.[0] || evmAddress;

      if (connectedAddress) {
        await fetchUser(connectedAddress, { evmConnector: connector, promptForSignature: true, walletType: 'evm' });
      }
    } catch (error) {
      console.error('Failed to connect EVM wallet:', error);
    }
  };

  const handleConnectTron = async () => {
    try {
      if (isEvmConnected) {
        disconnect();
      }

      if (isTronConnected && tronAddress) {
        setIsWalletDialogOpen(false);
        await fetchUser(tronAddress, { promptForSignature: true, walletType: 'tron' });
        return;
      }

      const address = await connectTron();
      if (address) {
        setIsWalletDialogOpen(false);
        await fetchUser(address, { promptForSignature: true, walletType: 'tron' });
      }
    } catch (error) {
      console.error('Failed to connect TronLink:', error);
    }
  };

  return (
    <header
      className={cn(
        'z-50 flex items-center',
        isGameOverlay
          ? 'pointer-events-none absolute h-auto w-auto bg-transparent p-0'
          : 'sticky top-0 h-16 shrink-0 gap-4 border-b border-teal-400/20 bg-black/25 px-4 shadow-lg shadow-teal-400/10 backdrop-blur-md sm:px-6',
      )}
      style={isGameOverlay ? {
        top: 'max(0.5rem, env(safe-area-inset-top))',
        right: 'max(0.5rem, env(safe-area-inset-right))',
      } : undefined}
    >
      {!isGameOverlay && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="hover:bg-teal-400/10 hover:text-cyan-300 transition-all duration-300"
        >
          <PanelLeft />
          <span className="sr-only">Alternar barra lateral</span>
        </Button>
      )}

      {!isGameOverlay && (isMobile || state === 'collapsed') && (
        <div className="flex items-center gap-2 group h-full">
          <Image src="/Cukie_logo_first.png" alt="Cukies World" width={140} height={40} className="object-contain max-h-[48px] w-auto" />
        </div>
      )}

      {!isGameOverlay && <div className="flex-1" />}
      <div
        className={cn(
          'flex items-center gap-4',
          isGameOverlay && 'pointer-events-auto gap-2',
        )}
      >
        {user && !isGameOverlay && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full group hover:bg-teal-400/10 transition-all duration-300">
                <Bell className="group-hover:text-cyan-300 transition-colors" />
                <span className="absolute top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-300"></span>
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 border-2 border-teal-400/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-teal-400/10" align="end">
                <CardHeader className="pb-4">
                  <CardTitle className="text-foreground">Notificaciones</CardTitle>
                  <CardDescription>Tienes 1 mensaje sin leer.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex items-start gap-4 p-3 rounded-lg bg-teal-400/5 border border-teal-400/10">
                      <Avatar className="h-10 w-10 border-2 border-cyan-300/30">
                          <AvatarImage src="https://placehold.co/100x100.png" alt="Avatar" data-ai-hint="logo icon"/>
                          <AvatarFallback className="bg-gradient-to-br from-cyan-300 to-teal-400 text-white font-bold">HL</AvatarFallback>
                      </Avatar>
                      <div className="grid gap-1">
                          <p className="text-sm font-medium text-foreground">Bienvenido a Cukies World</p>
                          <p className="text-sm text-muted-foreground">Completa tu primera misión para ganar puntos extra.</p>
                      </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full border-teal-400/30 bg-teal-400/10 hover:bg-teal-400/20 hover:border-cyan-300/50 transition-all duration-300" 
                    asChild
                  >
                    <Link href="/quests">Ver todo</Link>
                  </Button>
                </CardContent>
            </PopoverContent>
          </Popover>
        )}

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'relative h-10 w-10 rounded-full group hover:bg-teal-400/10 transition-all duration-300',
                  isGameOverlay && 'h-11 w-11',
                )}
              >
                <Avatar
                  className={cn(
                    'h-10 w-10 border-2 border-cyan-300/30 group-hover:border-cyan-300/60 transition-all duration-300',
                    isGameOverlay && 'h-11 w-11',
                  )}
                >
                  <AvatarImage src={user.profilePictureUrl ?? "https://placehold.co/100x100.png"} alt={user.username ?? "user"} data-ai-hint="profile avatar" />
                  <AvatarFallback className="bg-gradient-to-br from-cyan-300 to-teal-400 text-white font-bold">
                    {user.username?.slice(0,1).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-2 border-teal-400/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-teal-400/10">
              <DropdownMenuLabel className="text-base font-bold text-foreground">
                {user.username 
                  ? user.username.length > 15 
                    ? `${user.username.slice(0, 15)}...` 
                    : user.username
                  : "Mi cuenta"}
              </DropdownMenuLabel>
              <div className="px-3 pt-2 pb-3 space-y-3">
                <div className="p-3 rounded-lg bg-gradient-to-r from-teal-400/10 to-teal-400/10 border border-cyan-300/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Rango</p>
                  <p className="font-bold text-cyan-300 text-sm">{userRank}</p>
                </div>
                <div className="p-3 rounded-lg bg-gradient-to-r from-teal-400/10 to-cyan-400/10 border border-cyan-300/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">XP</p>
                  <p className="font-bold font-mono text-cyan-300 text-lg">{userXP.toLocaleString()}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="bg-teal-400/20" />
              <DropdownMenuItem disabled className="opacity-50">
                <Wallet className="mr-3 h-4 w-4 text-gray-400" />
                <span>Mi wallet</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="hover:bg-teal-400/10 transition-colors">
                <Link href="/settings">
                  <Settings className="mr-3 h-4 w-4 text-cyan-300" />
                  <span>Ajustes</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-teal-400/20" />
              <DropdownMenuItem 
                onClick={() => disconnect()} 
                className="hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
              >
                <LogOut className="mr-3 h-4 w-4" />
                <span>Desconectar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button 
              onClick={() => !isWaitingForApproval && setIsWalletDialogOpen(true)} 
              disabled={isWaitingForApproval || isAuthLoading}
              className={cn(
                isWaitingForApproval
                  ? 'cursor-not-allowed bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/30 animate-pulse'
                  : 'bg-gradient-to-r from-teal-400 to-teal-500 shadow-teal-400/30 hover:from-teal-500 hover:to-teal-600 hover:scale-105 hover:shadow-xl hover:shadow-teal-400/40',
                'rounded-xl px-6 py-2 font-bold text-white shadow-lg transition-all duration-300',
                isGameOverlay && 'h-11 w-11 rounded-full border border-cyan-200/30 bg-black/45 p-0 backdrop-blur-md hover:bg-black/65',
              )}
              aria-label={isWaitingForApproval ? 'Esperando aprobación de wallet' : 'Conectar wallet'}
              title={isGameOverlay ? 'Conectar wallet' : undefined}
            >
              {isWaitingForApproval || isAuthLoading ? (
                <>
                  <div className={cn('animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent', !isGameOverlay && 'md:mr-2')} />
                  <span className={cn(isGameOverlay ? 'sr-only' : 'hidden md:inline')}>
                    {isWaitingForApproval ? 'Esperando aprobación...' : 'Cargando...'}
                  </span>
                </>
              ) : (
                <>
                  <Wallet className={cn('h-4 w-4', !isGameOverlay && 'md:mr-2')} />
                  <span className={cn(isGameOverlay ? 'sr-only' : 'hidden md:inline')}>Conectar wallet</span>
                </>
              )}
            </Button>

            <HeaderWalletDialog
              open={isWalletDialogOpen}
              onOpenChange={setIsWalletDialogOpen}
              connectors={evmConnectors}
              onSelectConnector={(connector) => void handleConnectEVM(connector)}
              tronLink={{
                error: tronError,
                isInstalled: isTronInstalled,
                isLoading: isTronLoading,
                onSelect: () => void handleConnectTron(),
              }}
            />
          </>
        )}
      </div>
    </header>
  );
}
