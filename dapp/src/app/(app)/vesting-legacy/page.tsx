'use client';

import { useMemo } from 'react';
import { formatUnits, isAddress } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getBscScanTxUrl, ukiSaleContracts, vestingVaultAbi } from '@/lib/contracts/uki-sale';

type Schedule = {
  readonly [index: number]: bigint | undefined;
  readonly totalAmount?: bigint;
  readonly releasedAmount?: bigint;
  readonly start?: bigint;
  readonly cliff?: bigint;
  readonly duration?: bigint;
};
type ScheduleField = 'totalAmount' | 'releasedAmount' | 'start' | 'cliff' | 'duration';

function formatToken(value?: bigint) {
  if (value === undefined) return '0';
  return Number(formatUnits(value, 18)).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}

function formatDate(timestamp?: bigint) {
  if (!timestamp || timestamp === BigInt(0)) return null;
  return new Date(Number(timestamp) * 1000).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatShortAddress(value?: string) {
  if (!value) return '-';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatPercent(value: number) {
  return value.toLocaleString('es-ES', {
    maximumFractionDigits: 2,
  });
}

function scheduleField(schedule: Schedule | undefined, key: ScheduleField, index: number) {
  return schedule?.[key] ?? schedule?.[index];
}

export default function VestingPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: claimTxHash, isPending } = useWriteContract();
  const vaultAddress = ukiSaleContracts.vestingVaultAddress;
  const isConfigured = Boolean(vaultAddress && isAddress(vaultAddress));
  const contractAddress = isConfigured ? vaultAddress as `0x${string}` : undefined;
  const accountAddress = address as `0x${string}` | undefined;

  const { data: totalAllocated, isError: isTotalAllocatedError } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'totalAllocated',
    query: { enabled: isConfigured },
  });
  const { data: totalReleased, isError: isTotalReleasedError } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'totalReleased',
    query: { enabled: isConfigured },
  });
  const { data: unallocated, isError: isUnallocatedError } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'unallocatedBalance',
    query: { enabled: isConfigured },
  });
  const { data: presaleVestingStart, isError: isPresaleVestingStartError } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'presaleVestingStart',
    query: { enabled: isConfigured },
  });
  const { data: userSchedule, isError: isScheduleError } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'scheduleOf',
    args: accountAddress ? [accountAddress] : undefined,
    query: { enabled: isConfigured && Boolean(accountAddress) },
  });
  const { data: claimable, isError: isClaimableError } = useReadContract({
    chainId: ukiSaleContracts.chainId,
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'releasable',
    args: accountAddress ? [accountAddress] : undefined,
    query: { enabled: isConfigured && Boolean(accountAddress) },
  });

  const hasGlobalReadError = isTotalAllocatedError || isTotalReleasedError || isUnallocatedError || isPresaleVestingStartError;
  const hasWalletReadError = Boolean(isConnected && (isScheduleError || isClaimableError));
  const hasVestingReadError = isConfigured && (hasGlobalReadError || hasWalletReadError);

  const schedule = userSchedule as Schedule | undefined;
  const totalAmount = scheduleField(schedule, 'totalAmount', 0) ?? BigInt(0);
  const releasedAmount = scheduleField(schedule, 'releasedAmount', 1) ?? BigInt(0);
  const claimableAmount = claimable ?? BigInt(0);
  const vestedAmount = releasedAmount + claimableAmount;
  const lockedAmount = totalAmount > vestedAmount ? totalAmount - vestedAmount : BigInt(0);
  const unlockProgress = totalAmount > BigInt(0) ? Number((vestedAmount * BigInt(10000)) / totalAmount) / 100 : 0;
  const claimedProgress = totalAmount > BigInt(0) ? Number((releasedAmount * BigInt(10000)) / totalAmount) / 100 : 0;
  const hasPosition = totalAmount > BigInt(0);
  const vestingStart = scheduleField(schedule, 'start', 2);
  const vestingCliff = scheduleField(schedule, 'cliff', 3);
  const vestingDuration = scheduleField(schedule, 'duration', 4);
  const vestingEnd = vestingStart !== undefined && vestingDuration !== undefined ? vestingStart + vestingDuration : undefined;
  const configuredVestingStart = presaleVestingStart as bigint | undefined;
  const effectiveVestingStart = vestingStart && vestingStart > BigInt(0) ? vestingStart : configuredVestingStart;
  const vestingStartLabel = formatDate(effectiveVestingStart) ?? 'En TGE';
  const vestingEndLabel = formatDate(vestingEnd) ?? 'Pendiente de calendario';
  const vestingCliffLabel = formatDate(vestingCliff) ?? 'Sin cliff para comprador';

  const metrics = useMemo(() => [
    { label: 'Total asignado', value: `${formatToken(totalAmount)} UKI`, icon: ShieldCheck },
    { label: 'Disponible ahora', value: `${formatToken(claimableAmount)} UKI`, icon: Wallet },
    { label: 'Ya reclamado', value: `${formatToken(releasedAmount)} UKI`, icon: CheckCircle2 },
    { label: 'Bloqueado', value: `${formatToken(lockedAmount)} UKI`, icon: LockKeyhole },
  ], [claimableAmount, lockedAmount, releasedAmount, totalAmount]);

  function claimAll() {
    if (!contractAddress) return;
    writeContract({
      chainId: ukiSaleContracts.chainId,
      address: contractAddress,
      abi: vestingVaultAbi,
      functionName: 'releaseAll',
    });
  }

  return (
      <div className="uki-landing -m-6 min-h-screen px-6 py-8 text-[var(--uki-cream)] md:-m-8 md:px-8">
        <div className="uki-grid-bg" aria-hidden="true" />
        <div className="uki-noise" aria-hidden="true" />
        <div className="relative z-[2] mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-[16px] border border-[var(--uki-cyan)]/20 bg-[#070817]/90 p-6 shadow-[0_0_52px_rgba(228,92,255,0.12)] md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(228,92,255,0.20),transparent_24rem),radial-gradient(circle_at_18%_78%,rgba(242,195,75,0.11),transparent_18rem)]" aria-hidden="true" />
          <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <div className="uki-launch-badge inline-flex items-center gap-2">
                <LockKeyhole className="h-3.5 w-3.5" />
                Vesting UKI
              </div>
              <h1 className="mt-5 max-w-3xl font-headline text-4xl font-black uppercase leading-[0.95] text-[var(--uki-cream)] md:text-6xl">
                Consulta tus UKI de preventa
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">
                Revisa la asignación creada para tu cartera, cuánto queda bloqueado y qué parte puedes reclamar cuando el calendario de vesting empiece a liberar UKI.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em]">
                <span className="rounded-[7px] border border-[var(--uki-cyan)]/25 bg-[var(--uki-cyan)]/10 px-3 py-2 text-[var(--uki-cyan)]">
                  Cadena BNB
                </span>
                <span className="rounded-[7px] border border-white/10 bg-white/5 px-3 py-2 text-[var(--uki-text)]">
                  Bóveda {isConfigured ? 'configurada' : 'pendiente'}
                </span>
                <span className="rounded-[7px] border border-white/10 bg-white/5 px-3 py-2 text-[var(--uki-text)]">
                  Cartera {isConnected ? formatShortAddress(address) : 'no conectada'}
                </span>
              </div>
            </div>

            <div className="rounded-[14px] border border-[var(--uki-cyan)]/25 bg-[#0d0b24]/82 p-5 shadow-[0_0_34px_rgba(228,92,255,0.1)]">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-[var(--uki-gold)]" />
                <p className="font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-cyan)]">Inicio de vesting</p>
              </div>
              <p className="mt-4 font-headline text-4xl font-black uppercase leading-none text-[var(--uki-cream)]">{vestingStartLabel}</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                Mientras la fecha exacta no esté definida en contrato, se muestra “En TGE” como referencia operativa.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Fin estimado</p>
                  <p className="mt-1 font-headline text-base font-black text-[var(--uki-cream)]">{vestingEndLabel}</p>
                </div>
                <div className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Cliff</p>
                  <p className="mt-1 font-headline text-base font-black text-[var(--uki-cream)]">{vestingCliffLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {!isConfigured ? (
          <section className="rounded-[12px] border border-[#f2c34b]/30 bg-[#2b1d08]/48 p-4 text-sm text-[#ffe2a0]">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-[#fff2dc]">El contrato de vesting todavía no está configurado.</p>
                <p className="mt-1 text-[#ffe2a0]/80">
                  Falta configurar `NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS` y las direcciones de preventa antes de validar el flujo posterior a compra.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {hasVestingReadError ? (
          <section className="rounded-[12px] border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-100">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-red-50">Los datos de vesting no están disponibles ahora mismo.</p>
                <p className="mt-1 text-red-100/80">
                  La lectura on-chain falló en la red {ukiSaleContracts.chainId}. Revisa RPC, dirección de contrato y red seleccionada antes de tratar estos valores como definitivos.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[12px] border border-[var(--uki-cyan)]/18 bg-[#070817]/86 p-4 shadow-[0_0_28px_rgba(228,92,255,0.07)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-muted)]">{metric.label}</span>
                <metric.icon className="h-4 w-4 text-[var(--uki-cyan)]" />
              </div>
              <div className="mt-3 font-headline text-2xl font-black text-[var(--uki-cream)]">{metric.value}</div>
            </div>
          ))}
        </div>

        {hasPosition ? (
          <div className="rounded-[12px] border border-[var(--uki-cyan)]/25 bg-[var(--uki-cyan)]/10 px-4 py-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
            Esta cartera tiene <strong className="text-[var(--uki-cream)]">{formatToken(totalAmount)} UKI</strong> asignados. Los <strong className="text-[var(--uki-cream)]">{formatToken(claimableAmount)} UKI</strong> disponibles ahora son solo la parte reclamable según el calendario lineal.
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
          <section className="rounded-[14px] border border-[var(--uki-cyan)]/22 bg-[#070817]/90 p-5 shadow-[0_0_44px_rgba(228,92,255,0.08)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">Mi vesting de preventa</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
                  {isConnected ? address : 'Conecta una cartera para leer tu calendario en vivo.'}
                </p>
              </div>
              <Button
                onClick={claimAll}
                disabled={!isConfigured || !isConnected || isPending || !claimable || claimable === BigInt(0)}
                className="h-11 rounded-[8px] border border-[var(--uki-cyan)]/60 bg-[var(--uki-cyan)] px-5 font-headline text-xs font-black uppercase tracking-[0.1em] text-white shadow-[0_0_18px_rgba(228,92,255,0.22)] hover:bg-[#f19bff]"
              >
                {isPending ? 'Confirmando...' : 'Reclamar UKI disponible'}
              </Button>
            </div>

            {claimTxHash ? (
              <a
                href={getBscScanTxUrl(claimTxHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-[8px] border border-[var(--uki-cyan)]/25 bg-[var(--uki-cyan)]/10 px-3 py-2 text-sm font-bold text-[var(--uki-cyan)] hover:bg-[var(--uki-cyan)]/15"
              >
                Transacción de reclamación enviada
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}

            <div className="mt-6 grid gap-5 lg:grid-cols-[220px_1fr]">
              <div className="flex aspect-square items-center justify-center rounded-[14px] border border-[var(--uki-cyan)]/22 bg-[var(--uki-cyan)]/6">
                <div className="text-center">
                  <div className="font-headline text-5xl font-black text-[var(--uki-cyan)]">{formatPercent(unlockProgress)}%</div>
                  <div className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--uki-muted)]">liberado</div>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-5">
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-[var(--uki-cyan)] to-[#f2c34b]" style={{ width: `${Math.min(unlockProgress, 100)}%` }} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Total asignado</div>
                    <div className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">{formatToken(totalAmount)} UKI</div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Disponible</div>
                    <div className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">{formatToken(claimableAmount)} UKI</div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--uki-muted)]">Reclamado</div>
                    <div className="mt-1 font-headline text-lg font-black text-[var(--uki-cream)]">{formatToken(releasedAmount)} UKI</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-[10px] border border-[#f2c34b]/25 bg-[#2b1d08]/42 px-3 py-2 text-sm font-semibold text-[#ffe2a0]">
                  <CalendarClock className="h-4 w-4" />
                  Ventana de vesting: {vestingStartLabel} - {vestingEndLabel}
                </div>
              </div>
            </div>

            {isConfigured && isConnected && !hasPosition && !hasWalletReadError ? (
              <div className="mt-6 rounded-[10px] border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                No se ha encontrado un calendario de vesting para esta cartera. Después de una compra correcta, aquí aparecerá la asignación UKI creada por el contrato de preventa.
              </div>
            ) : null}
          </section>

          <aside className="rounded-[14px] border border-[var(--uki-cyan)]/18 bg-[#0d0b24]/82 p-5 shadow-[0_0_36px_rgba(228,92,255,0.07)]">
            <h2 className="font-headline text-xl font-black uppercase text-[var(--uki-cream)]">Qué pasa después de comprar</h2>
            <div className="mt-4 space-y-3">
              {[
                ['1', 'Compra registrada', 'La preventa guarda cuánto ASM gastó esta cartera y cuántos UKI compró.'],
                ['2', 'Asignación creada', 'Los UKI quedan asignados a esta cartera dentro de la bóveda de vesting.'],
                ['3', 'Liberación gradual', 'La parte reclamable crece según la ventana de vesting configurada.'],
                ['4', 'Reclamación disponible', 'Usa esta pantalla para liberar los UKI desbloqueados a la cartera conectada.'],
              ].map(([step, title, body]) => (
                <div key={step} className="grid grid-cols-[2rem_1fr] gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[var(--uki-cyan)] text-sm font-black text-white">{step}</div>
                  <div>
                    <p className="font-bold text-[var(--uki-cream)]">{title}</p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
      </div>
  );
}
