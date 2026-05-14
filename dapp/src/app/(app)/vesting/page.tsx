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
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getBscScanTxUrl, ukiSaleContracts, vestingVaultAbi } from '@/lib/contracts/uki-sale';

type Schedule = readonly [bigint, bigint, bigint, bigint, bigint];

function formatToken(value?: bigint) {
  if (value === undefined) return '0';
  return Number(formatUnits(value, 18)).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}

function formatDate(timestamp?: bigint) {
  if (!timestamp || timestamp === BigInt(0)) return '-';
  return new Date(Number(timestamp) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortAddress(value?: string) {
  if (!value) return '-';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatPercent(value: number) {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}

function contractUrl(address?: string) {
  if (!address || !isAddress(address)) return undefined;
  return `${ukiSaleContracts.blockExplorerBaseUrl.replace(/\/$/, '')}/address/${address}`;
}

export default function VestingPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: claimTxHash, isPending } = useWriteContract();
  const vaultAddress = ukiSaleContracts.vestingVaultAddress;
  const isConfigured = Boolean(vaultAddress && isAddress(vaultAddress));
  const contractAddress = isConfigured ? vaultAddress as `0x${string}` : undefined;
  const accountAddress = address as `0x${string}` | undefined;

  const { data: totalAllocated } = useReadContract({
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'totalAllocated',
    query: { enabled: isConfigured },
  });
  const { data: totalReleased } = useReadContract({
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'totalReleased',
    query: { enabled: isConfigured },
  });
  const { data: unallocated } = useReadContract({
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'unallocatedBalance',
    query: { enabled: isConfigured },
  });
  const { data: userSchedule } = useReadContract({
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'scheduleOf',
    args: accountAddress ? [accountAddress] : undefined,
    query: { enabled: isConfigured && Boolean(accountAddress) },
  });
  const { data: claimable } = useReadContract({
    address: contractAddress,
    abi: vestingVaultAbi,
    functionName: 'releasable',
    args: accountAddress ? [accountAddress] : undefined,
    query: { enabled: isConfigured && Boolean(accountAddress) },
  });

  const schedule = userSchedule as Schedule | undefined;
  const totalAmount = schedule?.[0] ?? BigInt(0);
  const releasedAmount = schedule?.[1] ?? BigInt(0);
  const claimableAmount = claimable ?? BigInt(0);
  const vestedAmount = releasedAmount + claimableAmount;
  const lockedAmount = totalAmount > vestedAmount ? totalAmount - vestedAmount : BigInt(0);
  const unlockProgress = totalAmount > BigInt(0) ? Number((vestedAmount * BigInt(10000)) / totalAmount) / 100 : 0;
  const claimedProgress = totalAmount > BigInt(0) ? Number((releasedAmount * BigInt(10000)) / totalAmount) / 100 : 0;
  const hasPosition = totalAmount > BigInt(0);
  const vestingStart = schedule?.[2];
  const vestingCliff = schedule?.[3];
  const vestingEnd = schedule ? schedule[2] + schedule[4] : undefined;

  const metrics = useMemo(() => [
    { label: 'Purchased allocation', value: `${formatToken(totalAmount)} UKI`, icon: ShieldCheck },
    { label: 'Claimable now', value: `${formatToken(claimableAmount)} UKI`, icon: Wallet },
    { label: 'Already claimed', value: `${formatToken(releasedAmount)} UKI`, icon: CheckCircle2 },
    { label: 'Still locked', value: `${formatToken(lockedAmount)} UKI`, icon: LockKeyhole },
  ], [claimableAmount, lockedAmount, releasedAmount, totalAmount]);

  function claimAll() {
    if (!contractAddress) return;
    writeContract({
      address: contractAddress,
      abi: vestingVaultAbi,
      functionName: 'releaseAll',
    });
  }

  return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
              <LockKeyhole className="h-3.5 w-3.5" />
              UKI token operations
            </div>
            <h1 className="font-headline text-4xl font-bold text-white md:text-5xl">UKI Vesting</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Track the UKI assigned to your wallet after presale purchases, see what is still locked and claim tokens as they unlock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-2 text-teal-100">
              Chain {ukiSaleContracts.chainId}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-200">
              Vault {isConfigured ? 'configured' : 'pending'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-200">
              Presale {ukiSaleContracts.presaleAddress ? 'linked' : 'pending'}
            </span>
          </div>
        </div>

        {!isConfigured ? (
          <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-50">Vesting contract is not configured.</p>
                <p className="mt-1 text-amber-100/80">
                  Add `NEXT_PUBLIC_UKI_VESTING_VAULT_ADDRESS` and the matching presale contract addresses before testing the post-purchase flow.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-white/10 bg-[#172522]/85 p-4 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">{metric.label}</span>
                <metric.icon className="h-4 w-4 text-[#44edd6]" />
              </div>
              <div className="mt-3 text-2xl font-bold text-white">{metric.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
          <section className="rounded-lg border border-white/10 bg-[#101b19]/90 p-5 shadow-xl shadow-black/25">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="font-headline text-2xl font-semibold text-white">My presale vesting</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {isConnected ? address : 'Connect a wallet to read your live schedule.'}
                </p>
              </div>
              <Button
                onClick={claimAll}
                disabled={!isConfigured || !isConnected || isPending || !claimable || claimable === BigInt(0)}
                className="bg-[#008080] text-white hover:bg-[#009999]"
              >
                {isPending ? 'Confirming...' : 'Claim available UKI'}
              </Button>
            </div>

            {claimTxHash ? (
              <a
                href={getBscScanTxUrl(claimTxHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-teal-300/20 bg-teal-300/10 px-3 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-300/15"
              >
                Claim transaction submitted
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}

            <div className="mt-6 grid gap-5 lg:grid-cols-[220px_1fr]">
              <div className="flex aspect-square items-center justify-center rounded-lg border border-teal-300/20 bg-teal-300/5">
                <div className="text-center">
                  <div className="text-5xl font-bold text-[#44edd6]">{formatPercent(unlockProgress)}%</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">unlocked</div>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-5">
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#44edd6]" style={{ width: `${Math.min(unlockProgress, 100)}%` }} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-400">Allocated</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatToken(totalAmount)} UKI</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Claimable</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatToken(claimableAmount)} UKI</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Claimed</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatToken(releasedAmount)} UKI</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                  <CalendarClock className="h-4 w-4" />
                  Vesting window: {formatDate(vestingStart)} - {formatDate(vestingEnd)}
                </div>
              </div>
            </div>

            {isConnected && !hasPosition ? (
              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
                No presale vesting schedule was found for this wallet. After a successful purchase, this area should show the UKI allocation created by the presale contract.
              </div>
            ) : null}
          </section>

          <aside className="rounded-lg border border-white/10 bg-[#172522]/90 p-5 shadow-xl shadow-black/25">
            <h2 className="font-headline text-xl font-semibold text-white">What happens after purchase</h2>
            <div className="mt-4 space-y-3">
              {[
                ['1', 'Purchase recorded', 'The presale stores how much ASM this wallet spent and how much UKI it bought.'],
                ['2', 'Vesting created', 'The UKI allocation is assigned to this wallet inside the vesting vault.'],
                ['3', 'Unlock over time', 'Claimable UKI grows according to the configured vesting window.'],
                ['4', 'Claim when available', 'Use this page to release unlocked UKI to the connected wallet.'],
              ].map(([step, title, body]) => (
                <div key={step} className="grid grid-cols-[2rem_1fr] gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#44edd6] text-sm font-black text-[#071311]">{step}</div>
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-[#101b19]/90 shadow-xl shadow-black/25">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="font-headline text-xl font-semibold text-white">Contract state</h2>
            <span className="text-xs uppercase tracking-[0.16em] text-slate-400">live reads</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Value</th>
                  <th className="px-5 py-3">Meaning</th>
                  <th className="px-5 py-3">Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-slate-200">
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Connected wallet</td>
                  <td className="px-5 py-4">{formatShortAddress(address)}</td>
                  <td className="px-5 py-4">Wallet used to read and claim the presale schedule.</td>
                  <td className="px-5 py-4">-</td>
                </tr>
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Vesting vault</td>
                  <td className="px-5 py-4">{formatShortAddress(vaultAddress)}</td>
                  <td className="px-5 py-4">Contract that stores vesting schedules and releases UKI.</td>
                  <td className="px-5 py-4">
                    {contractUrl(vaultAddress) ? (
                      <a href={contractUrl(vaultAddress)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-200 hover:text-teal-100">
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : '-'}
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Presale contract</td>
                  <td className="px-5 py-4">{formatShortAddress(ukiSaleContracts.presaleAddress)}</td>
                  <td className="px-5 py-4">Contract that creates buyer vesting after each purchase.</td>
                  <td className="px-5 py-4">
                    {contractUrl(ukiSaleContracts.presaleAddress) ? (
                      <a href={contractUrl(ukiSaleContracts.presaleAddress)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-200 hover:text-teal-100">
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : '-'}
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Global allocated</td>
                  <td className="px-5 py-4">{formatToken(totalAllocated)} UKI</td>
                  <td className="px-5 py-4">Total UKI already assigned to all vesting schedules.</td>
                  <td className="px-5 py-4">-</td>
                </tr>
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Global released</td>
                  <td className="px-5 py-4">{formatToken(totalReleased)} UKI</td>
                  <td className="px-5 py-4">Total UKI claimed by all beneficiaries.</td>
                  <td className="px-5 py-4">-</td>
                </tr>
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Unallocated vault balance</td>
                  <td className="px-5 py-4">{formatToken(unallocated)} UKI</td>
                  <td className="px-5 py-4">UKI in the vault that has not yet been assigned to schedules.</td>
                  <td className="px-5 py-4">-</td>
                </tr>
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Schedule cliff</td>
                  <td className="px-5 py-4">{formatDate(vestingCliff)}</td>
                  <td className="px-5 py-4">Before this date, this wallet cannot claim presale UKI.</td>
                  <td className="px-5 py-4">-</td>
                </tr>
                <tr className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">Claimed progress</td>
                  <td className="px-5 py-4">{formatPercent(claimedProgress)}%</td>
                  <td className="px-5 py-4">Part of this wallet allocation already released on-chain.</td>
                  <td className="px-5 py-4">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
  );
}
