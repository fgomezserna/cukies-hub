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

function scheduleField(schedule: Schedule | undefined, key: ScheduleField, index: number) {
  return schedule?.[key] ?? schedule?.[index];
}

function formatToken(value?: bigint) {
  if (value === undefined) return '0';
  const numeric = Number(formatUnits(value, 18));
  if (!Number.isFinite(numeric)) return '0';

  return numeric.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function formatShortAddress(value?: string) {
  if (!value) return '-';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function validUnixTimestamp(value?: bigint | null) {
  if (!value || value <= BigInt(0)) return null;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatVestingDate(value?: bigint | null) {
  const date = validUnixTimestamp(value);
  if (!date) return null;

  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function PublicVestingPage() {
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

  const schedule = userSchedule as Schedule | undefined;
  const totalAmount = scheduleField(schedule, 'totalAmount', 0) ?? BigInt(0);
  const releasedAmount = scheduleField(schedule, 'releasedAmount', 1) ?? BigInt(0);
  const claimableAmount = claimable ?? BigInt(0);
  const vestedAmount = releasedAmount + claimableAmount;
  const lockedAmount = totalAmount > vestedAmount ? totalAmount - vestedAmount : BigInt(0);
  const hasPosition = totalAmount > BigInt(0);
  const unlockProgress = totalAmount > BigInt(0)
    ? Number((vestedAmount * BigInt(10000)) / totalAmount) / 100
    : 0;

  const vestingStart = scheduleField(schedule, 'start', 2);
  const vestingDuration = scheduleField(schedule, 'duration', 4);
  const configuredVestingStart = presaleVestingStart as bigint | undefined;
  const effectiveVestingStart = vestingStart && vestingStart > BigInt(0)
    ? vestingStart
    : configuredVestingStart;
  const effectiveStartDate = validUnixTimestamp(effectiveVestingStart);
  const vestingEnd = effectiveStartDate && vestingDuration && vestingDuration > BigInt(0)
    ? (effectiveVestingStart ?? BigInt(0)) + vestingDuration
    : undefined;
  const vestingStartLabel = formatVestingDate(effectiveVestingStart) ?? 'Pendiente de inicio';
  const vestingEndLabel = formatVestingDate(vestingEnd) ?? 'Pendiente de calendario';

  const hasGlobalReadError =
    isTotalAllocatedError || isTotalReleasedError || isUnallocatedError || isPresaleVestingStartError;
  const hasWalletReadError = Boolean(isConnected && (isScheduleError || isClaimableError));
  const hasVestingReadError = isConfigured && (hasGlobalReadError || hasWalletReadError);

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
    <div className="uki-landing min-h-full w-full overflow-hidden bg-transparent text-[var(--uki-cream)]">
      <section className="relative z-[2] w-full pb-6">
        <div className="relative overflow-hidden rounded-[16px] border border-[var(--uki-lilac)]/20 bg-[#070817]/90 p-5 shadow-[0_0_52px_rgba(228,92,255,0.12)] sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(228,92,255,0.20),transparent_24rem)]" aria-hidden="true" />
          <div className="relative grid gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-end">
            <div>
              <p className="uki-launch-badge inline-flex items-center gap-2">
                <LockKeyhole className="h-3.5 w-3.5" />
                Tus UKI
              </p>
              <h1 className="mt-5 max-w-3xl font-headline text-4xl font-black uppercase leading-[0.95] text-[var(--uki-cream)] sm:text-6xl">
                Tu vesting
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-relaxed text-[var(--uki-text)]">
                Consulta cuánto tienes asignado, qué parte sigue bloqueada y cuántos UKI puedes enviar ahora a tu wallet.
              </p>
              <p className="mt-6 text-sm font-black text-[var(--uki-lilac)]">
                {isConnected ? `Wallet ${formatShortAddress(address)}` : 'Conecta tu wallet para consultar tu posición'}
              </p>
            </div>

            <div className="rounded-[14px] border border-[var(--uki-lilac)]/25 bg-[#0d0b24]/82 p-5 shadow-[0_0_34px_rgba(228,92,255,0.1)]">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-[var(--uki-lilac)]" />
                <p className="font-headline text-sm font-black uppercase tracking-[0.14em] text-[var(--uki-lilac)]">Disponible ahora</p>
              </div>
              <p className="mt-4 font-headline text-4xl font-black leading-none text-[var(--uki-cream)]">{formatToken(claimableAmount)} UKI</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
                {hasPosition
                  ? 'Esta es la cantidad que puedes reclamar con la wallet conectada.'
                  : 'Cuando tengas una asignación y se liberen UKI, aparecerán aquí.'}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Inicio</p>
                  <p className="mt-1 font-headline text-base font-black text-[var(--uki-cream)]">{vestingStartLabel}</p>
                </div>
                <div className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--uki-muted)]">Final</p>
                  <p className="mt-1 font-headline text-base font-black text-[var(--uki-cream)]">{vestingEndLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-[2] w-full pb-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[12px] border border-[var(--uki-lilac)]/18 bg-[#070817]/86 p-4 shadow-[0_0_28px_rgba(228,92,255,0.07)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--uki-muted)]">{metric.label}</span>
                <metric.icon className="h-4 w-4 text-[var(--uki-lilac)]" />
              </div>
              <div className="mt-3 font-headline text-2xl font-black text-[var(--uki-cream)]">{metric.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-[2] grid w-full gap-6 pb-14 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="rounded-[14px] border border-[var(--uki-lilac)]/22 bg-[#070817]/90 p-5 shadow-[0_0_44px_rgba(228,92,255,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="font-headline text-2xl font-black uppercase text-[var(--uki-cream)]">Mi calendario</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--uki-muted)]">
                {isConnected ? formatShortAddress(address) : 'Conecta una wallet para consultar tu calendario.'}
              </p>
            </div>
            <Button
              onClick={claimAll}
              disabled={!isConfigured || !isConnected || isPending || !claimable || claimable === BigInt(0)}
              className="h-11 rounded-[8px] border border-[var(--uki-lilac)]/60 bg-[var(--uki-lilac)] px-5 font-headline text-xs font-black uppercase tracking-[0.1em] text-white shadow-[0_0_18px_rgba(228,92,255,0.22)] hover:bg-[#f19bff]"
            >
              {isPending ? 'Confirmando...' : 'Reclamar UKI disponible'}
            </Button>
          </div>

          {claimTxHash ? (
            <a
              href={getBscScanTxUrl(claimTxHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-[8px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 px-3 py-2 text-sm font-bold text-[var(--uki-lilac)] hover:bg-[var(--uki-lilac)]/15"
            >
              Transacción de reclamación enviada
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="flex aspect-square items-center justify-center rounded-[14px] border border-[var(--uki-lilac)]/22 bg-[var(--uki-lilac)]/6">
              <div className="text-center">
                <div className="font-headline text-5xl font-black text-[var(--uki-lilac)]">{formatPercent(unlockProgress)}%</div>
                <div className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--uki-muted)]">liberado</div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-5">
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[var(--uki-lilac)]" style={{ width: `${Math.min(unlockProgress, 100)}%` }} />
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
              <div className="flex items-center gap-2 rounded-[10px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 px-3 py-2 text-sm font-semibold text-[var(--uki-text)]">
                <CalendarClock className="h-4 w-4" />
                Periodo de liberación: {vestingStartLabel} - {vestingEndLabel}
              </div>
            </div>
          </div>

          {hasPosition ? (
            <p className="mt-5 rounded-[10px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 p-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              Esta cartera tiene <strong className="text-[var(--uki-cream)]">{formatToken(totalAmount)} UKI</strong> asignados. Los <strong className="text-[var(--uki-cream)]">{formatToken(claimableAmount)} UKI</strong> disponibles ahora son solo la parte reclamable según el calendario lineal.
            </p>
          ) : isConfigured && isConnected && !hasWalletReadError ? (
            <p className="mt-5 rounded-[10px] border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-relaxed text-[var(--uki-text)]">
              No hay una asignación de vesting para esta wallet. Si recibes UKI sujetos a liberación gradual, el calendario aparecerá aquí automáticamente.
            </p>
          ) : null}
        </div>

        <aside className="rounded-[14px] border border-[var(--uki-lilac)]/18 bg-[#0d0b24]/82 p-5 shadow-[0_0_36px_rgba(228,92,255,0.07)]">
          <h2 className="font-headline text-xl font-black uppercase text-[var(--uki-cream)]">Cómo funciona tu vesting</h2>
          <div className="mt-4 space-y-3">
            {[
              ['1', 'Asignación registrada', 'Los UKI sujetos a vesting quedan asociados a tu wallet.'],
              ['2', 'Liberación gradual', 'La parte disponible aumenta según tu calendario.'],
              ['3', 'Cobro en tu wallet', 'Cuando haya UKI disponibles, puedes reclamarlos desde esta pantalla.'],
            ].map(([step, title, body]) => (
              <div key={step} className="grid grid-cols-[2rem_1fr] gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[var(--uki-lilac)] text-sm font-black text-white">{step}</div>
                <div>
                  <p className="font-bold text-[var(--uki-cream)]">{title}</p>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--uki-muted)]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {hasVestingReadError ? (
        <section className="relative z-[2] w-full pb-6">
          <div className="rounded-[12px] border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-100">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-red-50">Los datos de vesting no están disponibles ahora mismo.</p>
                <p className="mt-1 text-red-100/80">Vuelve a intentarlo en unos instantes. No mostraremos cantidades parciales como si fueran definitivas.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!isConfigured ? (
        <section className="relative z-[2] w-full pb-6">
          <div className="rounded-[12px] border border-[var(--uki-lilac)]/25 bg-[var(--uki-lilac)]/10 p-4 text-sm text-[var(--uki-text)]">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-[var(--uki-cream)]">El vesting no está disponible ahora mismo.</p>
                <p className="mt-1 text-[var(--uki-muted)]">La consulta y el cobro permanecerán desactivados hasta que el servicio esté disponible.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
