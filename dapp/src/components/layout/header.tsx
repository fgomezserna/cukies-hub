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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { getConnectorDescription, getConnectorDisplayName, getConnectorLogoSrc, getVisibleWalletConnectors } from '@/lib/wallet-connectors';



const ranks = [
  { xp: 50000, name: 'Hyppie Master' },
  { xp: 20000, name: 'Hyperliquid Veteran' },
  { xp: 10000, name: 'Sybil Slayer' },
  { xp: 5000, name: 'Experimented Hyppie' },
  { xp: 2500, name: 'Explorer' },
];

const getRank = (xp: number): string => {
  const userRank = ranks.find(rank => xp >= rank.xp);
  return userRank ? userRank.name : 'Sin rango';
};

function HeaderWalletLogo({ connector }: { connector: Connector }) {
  const logoSrc = getConnectorLogoSrc(connector);

  if (logoSrc) {
    return (
      <Image
        src={logoSrc}
        alt={`${getConnectorDisplayName(connector)} logo`}
        width={24}
        height={24}
        unoptimized
        className="h-6 w-6 object-contain"
      />
    );
  }

  return <Wallet className="h-6 w-6 text-white" />;
}

function HeaderTronLinkLogo() {
  return (
    <Image
      src="/brand/wallets/tronlink.png"
      alt="TronLink logo"
      width={24}
      height={24}
      unoptimized
      className="h-6 w-6 object-contain"
    />
  );
}

export default function Header() {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const { user, isLoading: isAuthLoading, isWaitingForApproval, fetchUser } = useAuth();
  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    address: tronAddress,
    connect: connectTron,
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

      if (isEvmConnected && evmAddress) {
        await fetchUser(evmAddress, { promptForSignature: true, walletType: 'evm' });
        return;
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
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-4 border-b border-teal-400/20 bg-black/25 backdrop-blur-md shadow-lg shadow-teal-400/10 px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="hover:bg-teal-400/10 hover:text-cyan-300 transition-all duration-300"
      >
        <PanelLeft />
        <span className="sr-only">Alternar barra lateral</span>
      </Button>

      {(isMobile || state === 'collapsed') && (
        <div className="flex items-center gap-2 group h-full">
            <Image src="/Cukie_logo_first.png" alt="Cukies World" width={140} height={40} className="object-contain max-h-[48px] w-auto" />
        </div>
      )}

      <div className="flex-1">
      </div>
      <div className="flex items-center gap-4">
        {user && (
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
              <Button variant="ghost" className="relative h-10 w-10 rounded-full group hover:bg-teal-400/10 transition-all duration-300">
                <Avatar className="h-10 w-10 border-2 border-cyan-300/30 group-hover:border-cyan-300/60 transition-all duration-300">
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
              className={`${
                isWaitingForApproval 
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 cursor-not-allowed" 
                  : "bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-500 hover:to-teal-600 hover:scale-105 hover:shadow-xl hover:shadow-teal-400/40"
              } text-white font-bold px-6 py-2 rounded-xl shadow-lg transition-all duration-300 ${
                isWaitingForApproval ? "shadow-amber-500/30 animate-pulse" : "shadow-teal-400/30"
              }`}
            >
              {isWaitingForApproval || isAuthLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent md:mr-2" />
                  <span className="hidden md:inline">
                    {isWaitingForApproval ? 'Esperando aprobación...' : 'Cargando...'}
                  </span>
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Conectar wallet</span>
                </>
              )}
            </Button>

            <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
              <DialogContent className="sm:max-w-md border-2 border-teal-400/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-teal-400/10">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-foreground">
                    Elige tipo de wallet
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Selecciona la wallet que quieres conectar
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {evmConnectors.length > 0 ? (
                    evmConnectors.map((connector) => (
                      <Button
                        key={connector.id}
                        onClick={() => void handleConnectEVM(connector)}
                        className="w-full h-auto p-5 flex flex-col items-start gap-3 bg-gradient-to-r from-teal-400/10 to-cyan-400/10 hover:from-teal-400/20 hover:to-cyan-400/20 border-2 border-cyan-300/30 hover:border-cyan-300/50 transition-all duration-300"
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-300/20 bg-white">
                            <HeaderWalletLogo connector={connector} />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-bold text-lg text-foreground">{getConnectorDisplayName(connector)}</div>
                            <div className="text-sm text-muted-foreground">{getConnectorDescription(connector)}</div>
                          </div>
                        </div>
                      </Button>
                    ))
                  ) : (
                    <div className="rounded-[8px] border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                      Instala una wallet EVM o configura WalletConnect para conectar.
                    </div>
                  )}

                  <Button
                    onClick={handleConnectTron}
                    disabled={!isTronInstalled || isTronLoading}
                    className="w-full h-auto p-6 flex flex-col items-start gap-3 bg-gradient-to-r from-teal-400/10 to-cyan-400/10 hover:from-teal-400/20 hover:to-cyan-400/20 border-2 border-cyan-300/30 hover:border-cyan-300/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-300/20 bg-white">
                        <HeaderTronLinkLogo />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-lg text-foreground">TronLink</div>
                        <div className="text-sm text-muted-foreground">
                          {isTronInstalled
                            ? isTronLoading
                              ? 'Esperando confirmacion en TronLink...'
                              : 'Conecta tu wallet TronLink'
                            : 'Instala la extensión TronLink'}
                        </div>
                      </div>
                    </div>
                  </Button>
                  {tronError && (
                    <p className="rounded-[8px] border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                      {tronError}
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </header>
  );
}
