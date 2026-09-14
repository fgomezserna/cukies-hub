'use client';

import React from 'react';
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
import { cn } from '@/lib/utils';
import { useWalletCoordinator } from '@/providers/wallet-coordinator-context';
import { useOptionalAppRuntime } from '@/providers/app-runtime-provider';

export function getAvatarFallback(username: string | null | undefined, walletAddress: string | null | undefined) {
  const usernameValue = username?.trim();
  if (usernameValue && !/^0x[a-f\d]{6,}$/i.test(usernameValue)) {
    return usernameValue.slice(0, 2).toUpperCase();
  }

  const walletValue = walletAddress?.trim();
  return walletValue ? walletValue.slice(-2).toUpperCase() : 'CW';
}

type UkiBalanceView = {
  balance: string;
  balanceRaw: string;
};

function formatUkiBalance(value: UkiBalanceView | null | undefined) {
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value.balanceRaw)) return null;

  try {
    const raw = BigInt(value.balanceRaw);
    const decimals = BigInt(10) ** BigInt(18);
    const integer = raw / decimals;
    const fraction = (raw % decimals).toString().padStart(18, '0');
    const visibleFraction = fraction.slice(0, 4).replace(/0+$/, '');
    const groupedInteger = integer.toLocaleString('es-ES');

    if (visibleFraction) return `${groupedInteger},${visibleFraction}`;
    if (raw > BigInt(0) && integer === BigInt(0)) return '<0,0001';
    return groupedInteger;
  } catch {
    return null;
  }
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
  const { user, isLoading: isAuthLoading, isWaitingForApproval, walletType } = useAuth();
  const { evm, tron, openWalletSelector, disconnectWallet } = useWalletCoordinator();
  const runtime = useOptionalAppRuntime();
  const accountSummary = runtime?.accountSummary ?? {
    data: undefined,
    state: 'idle' as const,
    error: null,
  };

  const formatWalletAddress = (address: string | null | undefined) => (
    address ? `${address.slice(0, 8)}…${address.slice(-6)}` : 'No conectada'
  );
  const formatResource = (value: string | number | null | undefined, suffix = '') => (
    value === null || value === undefined ? 'No disponible' : `${typeof value === 'number' ? value.toLocaleString('es-ES') : value}${suffix}`
  );
  const summary = accountSummary.data;
  const accountSummaryLoading = accountSummary.state === 'loading';
  const accountSummaryRefreshing = accountSummary.state === 'stale';
  const accountSummaryReady = accountSummary.state === 'ready';
  const cukiesSummaryReady = accountSummaryReady && summary?.cukies?.coverage === 'complete';
  const ukiBalanceLabel = formatUkiBalance(summary?.uki);
  const accountSummaryPendingLabel = accountSummaryLoading
    ? 'Cargando…'
    : accountSummaryRefreshing
      ? 'Actualizando…'
      : 'No disponible';

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
          <DropdownMenu onOpenChange={(open) => { if (open) runtime?.requestAccountSummary(); }}>
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
            <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1rem))] border-2 border-lilac-400/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-xl shadow-lilac-400/10">
              <DropdownMenuLabel className="text-base font-bold text-foreground">
                {user.username 
                  ? user.username.length > 15 
                    ? `${user.username.slice(0, 15)}...` 
                    : user.username
                  : "Mi cuenta"}
              </DropdownMenuLabel>
              <div className="grid gap-2 px-3 py-2">
                <div
                  className="grid gap-2 rounded-lg border border-lilac-300/15 bg-black/15 p-3"
                  aria-busy={!accountSummaryReady}
                  data-testid="account-resources"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                      Recursos de la cuenta
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground">BSC</span>
                  </div>
                  {walletType === 'evm' ? (
                    <div className="grid gap-1.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="whitespace-nowrap text-muted-foreground">UKI disponible</span>
                        <span
                          className="min-w-0 whitespace-nowrap text-right font-mono font-bold tabular-nums text-lilac-200"
                          title={accountSummaryReady && summary?.uki ? `${summary.uki.balance} UKI` : undefined}
                        >
                          {accountSummaryReady ? (ukiBalanceLabel ? <>{ukiBalanceLabel}&nbsp;UKI</> : 'No disponible') : accountSummaryPendingLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Créditos propios</span>
                        <span className="font-mono font-bold text-lilac-200">
                          {accountSummaryReady ? formatResource(summary?.credits?.availableCredits) : accountSummaryPendingLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Cukies totales</span>
                        <span className="font-mono font-bold text-lilac-200">
                          {cukiesSummaryReady ? (
                            summary?.cukies ? (
                              <>
                                {formatResource(summary.cukies.total)}
                                <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                                  ({formatResource(summary.cukies.inWallet)} en wallet)
                                </span>
                              </>
                            ) : 'No disponible'
                          ) : accountSummaryReady ? 'No disponible' : accountSummaryPendingLabel}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                      Conecta una wallet EVM para consultar UKI, créditos y Cukies de esa cuenta.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] font-bold">
                    <Link href="/cukie-master" className="text-lilac-200 hover:text-lilac-100">Gestionar UKI</Link>
                    <Link href="/credits" className="text-lilac-200 hover:text-lilac-100">Gestionar créditos</Link>
                    <Link href="/cukies" className="text-lilac-200 hover:text-lilac-100">Ver Cukies</Link>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-1 pt-1 text-sm text-muted-foreground">
                  <Wallet className="h-4 w-4 shrink-0 text-lilac-300" aria-hidden="true" />
                  <span className="font-medium text-foreground">Wallet conectada</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-lilac-300/15 bg-lilac-400/5 px-2.5 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      EVM / BSC
                      {walletType === 'evm' ? <span className="rounded-full border border-lilac-300/30 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-lilac-200">Tu cuenta</span> : null}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {evm.isConnected && evm.address ? formatWalletAddress(evm.address) : 'No conectada'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-bold text-lilac-200"
                    onClick={() => (evm.isConnected ? disconnectWallet('evm') : openWalletSelector('evm', 'Conecta una wallet EVM para gestionar UKI, créditos y Cukies.'))}
                  >
                    {evm.isConnected ? 'Desconectar' : 'Conectar'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-300/15 bg-emerald-400/5 px-2.5 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      TRON / TronLink
                      {walletType === 'tron' ? <span className="rounded-full border border-emerald-300/30 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-200">Tu cuenta</span> : null}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {tron.isConnected && tron.address ? formatWalletAddress(tron.address) : 'No conectada'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-bold text-emerald-200"
                    onClick={() => (tron.isConnected ? disconnectWallet('tron') : openWalletSelector('tron', 'Conecta TronLink en TRON Mainnet para usar tu wallet TRON.'))}
                  >
                    {tron.isConnected ? 'Desconectar' : 'Conectar'}
                  </button>
                </div>
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
                onClick={() => disconnectWallet(walletType === 'tron' ? 'tron' : 'evm')}
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
              onClick={() => !isWaitingForApproval && openWalletSelector('any', 'Elige la wallet que quieres usar para continuar.')}
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

          </>
        )}
      </div>
    </header>
  );
}
