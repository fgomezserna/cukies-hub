'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Wallet, UserRound, LogOut, PanelLeft, Settings2 } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/providers/auth-provider';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useAccount, useConnect, useDisconnect, type Connector } from 'wagmi';
import { useTronLink } from '@/hooks/use-tronlink';
import {
  getMobileWalletConnector,
  getMobileWalletLaunchUrl,
  getVisibleWalletConnectors,
  type MobileWalletId,
} from '@/lib/wallet-connectors';
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

export function getAvatarFallback(username: string | null | undefined, walletAddress: string | null | undefined) {
  const usernameValue = username?.trim();
  if (usernameValue && !/^0x[a-f\d]{6,}$/i.test(usernameValue)) {
    return usernameValue.slice(0, 2).toUpperCase();
  }

  const walletValue = walletAddress?.trim();
  return walletValue ? walletValue.slice(-2).toUpperCase() : 'CW';
}

interface HeaderProps {
  hideDisconnectedWalletTrigger?: boolean;
  variant?: 'default' | 'game-overlay';
}

export default function Header({
  hideDisconnectedWalletTrigger = false,
  variant = 'default',
}: HeaderProps) {
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

  useEffect(() => {
    const openWalletDialog = () => setIsWalletDialogOpen(true);
    window.addEventListener('cukies:open-wallet-dialog', openWalletDialog);
    return () => window.removeEventListener('cukies:open-wallet-dialog', openWalletDialog);
  }, []);
  
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

  const handleMobileWallet = async (walletId: MobileWalletId) => {
    const connector = getMobileWalletConnector(evmConnectors, walletId);
    if (connector) {
      await handleConnectEVM(connector);
      return;
    }

    const launchUrl = getMobileWalletLaunchUrl(walletId, window.location.href);
    setIsWalletDialogOpen(false);

    if (walletId === 'safepal' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
      } catch {
        // SafePal still opens its official install page when clipboard access is unavailable.
      }
    }

    window.location.assign(launchUrl);
  };

  return (
    <header
      className={cn(
        'z-50 flex items-center',
        isGameOverlay
          ? 'pointer-events-none absolute h-auto w-auto bg-transparent p-0'
          : 'sticky top-0 h-16 shrink-0 gap-4 border-b border-lilac-400/20 bg-black/25 px-4 shadow-lg shadow-lilac-400/10 backdrop-blur-md sm:px-6',
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
          className="hover:bg-lilac-400/10 hover:text-lilac-300 transition-all duration-300"
        >
          <PanelLeft />
          <span className="sr-only">Alternar barra lateral</span>
        </Button>
      )}

      {!isGameOverlay && (isMobile || state === 'collapsed') && (
        <Link
          href="/"
          aria-label="Volver a la landing"
          className="group flex h-full items-center gap-2"
        >
          <Image src="/Cukie_logo_first.png" alt="Cukies World" width={140} height={40} className="object-contain max-h-[48px] w-auto" />
        </Link>
      )}

      {!isGameOverlay && <div className="flex-1" />}
      <div
        className={cn(
          'flex items-center gap-4',
          isGameOverlay && 'pointer-events-auto gap-2',
        )}
      >
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'relative h-10 w-10 rounded-full group hover:bg-lilac-400/10 transition-all duration-300',
                  isGameOverlay && 'h-11 w-auto gap-2 rounded-full border border-emerald-300/30 bg-black/55 px-2 pr-3 text-white backdrop-blur-md hover:bg-black/70',
                )}
                aria-label={isGameOverlay ? 'Wallet conectada' : undefined}
              >
                <Avatar
                  className={cn(
                    'h-10 w-10 border-2 border-lilac-300/30 group-hover:border-lilac-300/60 transition-all duration-300',
                    isGameOverlay && 'h-11 w-11',
                  )}
                >
                  <AvatarImage src={user.profilePictureUrl || undefined} alt={user.username ?? "Avatar de cuenta"} />
                  <AvatarFallback className="bg-gradient-to-br from-lilac-300 to-lilac-400 text-white font-bold">
                    {getAvatarFallback(user.username, user.walletAddress)}
                  </AvatarFallback>
                </Avatar>
                {isGameOverlay ? (
                  <span className="hidden text-xs font-bold sm:inline">Wallet conectada</span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-2 border-lilac-400/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-lilac-400/10">
              <DropdownMenuLabel className="text-base font-bold text-foreground">
                {user.username 
                  ? user.username.length > 15 
                    ? `${user.username.slice(0, 15)}...` 
                    : user.username
                  : "Mi cuenta"}
              </DropdownMenuLabel>
              <div className="px-3 pt-2 pb-3 space-y-3">
                <div className="p-3 rounded-lg bg-gradient-to-r from-lilac-400/10 to-lilac-400/10 border border-lilac-300/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Rango</p>
                  <p className="font-bold text-lilac-300 text-sm">{userRank}</p>
                </div>
                <div className="p-3 rounded-lg bg-gradient-to-r from-lilac-400/10 to-lilac-400/10 border border-lilac-300/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">XP</p>
                  <p className="font-bold font-mono text-lilac-300 text-lg">{userXP.toLocaleString()}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="bg-lilac-400/20" />
              <div className="flex items-start gap-3 px-3 py-2 text-sm text-muted-foreground">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-lilac-300" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">Wallet conectada</span>
                  <span className="block truncate font-mono text-xs" title={user.walletAddress}>
                    {user.walletAddress.slice(0, 8)}…{user.walletAddress.slice(-6)}
                  </span>
                </span>
              </div>
              <DropdownMenuItem asChild className="hover:bg-lilac-400/10 transition-colors">
                <Link href={isGameOverlay ? '/games/treasure-hunt/profile' : '/profile'}>
                  <UserRound className="mr-3 h-4 w-4 text-lilac-300" />
                  <span>{isGameOverlay ? 'Alias de competición' : 'Mi cuenta'}</span>
                </Link>
              </DropdownMenuItem>
              {!isGameOverlay && (
                <DropdownMenuItem asChild className="hover:bg-lilac-400/10 transition-colors">
                  <Link href="/settings">
                    <Settings2 className="mr-3 h-4 w-4 text-lilac-300" />
                    <span>Ajustes de perfil</span>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-lilac-400/20" />
              <DropdownMenuItem 
                onClick={() => disconnect()} 
                className="hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
              >
                <LogOut className="mr-3 h-4 w-4" />
                <span>Desconectar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : hideDisconnectedWalletTrigger ? null : (
          <>
            <Button 
              onClick={() => !isWaitingForApproval && setIsWalletDialogOpen(true)} 
              disabled={isWaitingForApproval || isAuthLoading}
              className={cn(
                isWaitingForApproval
                  ? 'cursor-not-allowed bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/30 animate-pulse'
                  : 'bg-gradient-to-r from-lilac-400 to-lilac-500 shadow-lilac-400/30 hover:from-lilac-500 hover:to-lilac-600 hover:scale-105 hover:shadow-xl hover:shadow-lilac-400/40',
                'rounded-xl px-6 py-2 font-bold text-white shadow-lg transition-all duration-300',
                isGameOverlay && 'h-11 w-auto gap-2 rounded-full border border-lilac-200/30 bg-black/55 px-4 backdrop-blur-md hover:bg-black/70',
              )}
              aria-label={isWaitingForApproval ? 'Esperando aprobación de wallet' : 'Conectar wallet'}
              title={isGameOverlay ? 'Conectar wallet' : undefined}
            >
              {isWaitingForApproval || isAuthLoading ? (
                <>
                  <div className={cn('animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent', !isGameOverlay && 'md:mr-2')} />
                  <span className={cn(isGameOverlay ? 'hidden sm:inline' : 'hidden md:inline')}>
                    {isWaitingForApproval ? 'Esperando aprobación...' : 'Cargando...'}
                  </span>
                </>
              ) : (
                <>
                  <Wallet className={cn('h-4 w-4', !isGameOverlay && 'md:mr-2')} />
                  <span className={cn(isGameOverlay ? 'hidden sm:inline' : 'hidden md:inline')}>Conectar wallet</span>
                </>
              )}
            </Button>

            <HeaderWalletDialog
              open={isWalletDialogOpen}
              onOpenChange={setIsWalletDialogOpen}
              connectors={evmConnectors}
              onSelectMobileWallet={(walletId) => void handleMobileWallet(walletId)}
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
