'use client';

import { useMemo, useState } from 'react';
import { formatUnits, isAddress, keccak256, parseUnits, toBytes } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { CalendarClock, CheckCircle2, LockKeyhole, Plus, ShieldCheck, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ukiSaleContracts, vestingVaultAbi } from '@/lib/contracts/uki-sale';

type Schedule = readonly [bigint, bigint, bigint, bigint, bigint];

const scheduleRows = [
  { id: 'PRESALE', label: 'Presale', allocation: 'Buyer allocations', status: 'Live claim flow' },
  { id: 'TEAM', label: 'Team', allocation: 'Core contributors', status: 'Cliff required' },
  { id: 'ADVISORS', label: 'Advisors', allocation: 'Advisory grants', status: 'Cliff required' },
  { id: 'ECOSYSTEM', label: 'Ecosystem', allocation: 'Rewards and growth', status: 'Managed' },
];

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

function daysFromNow(days: number) {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

export default function VestingPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const vaultAddress = ukiSaleContracts.vestingVaultAddress;
  const isConfigured = Boolean(vaultAddress && isAddress(vaultAddress));
  const contractAddress = isConfigured ? vaultAddress as `0x${string}` : undefined;
  const accountAddress = address as `0x${string}` | undefined;
  const [beneficiary, setBeneficiary] = useState('');
  const [amount, setAmount] = useState('100000');
  const [scheduleId, setScheduleId] = useState('TEAM');
  const [startDays, setStartDays] = useState('365');
  const [cliffDays, setCliffDays] = useState('365');
  const [durationDays, setDurationDays] = useState('730');

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
  const lockedAmount = totalAmount > releasedAmount ? totalAmount - releasedAmount : BigInt(0);
  const progress = totalAmount > BigInt(0) ? Number((releasedAmount * BigInt(10000)) / totalAmount) / 100 : 0;

  const metrics = useMemo(() => [
    { label: 'Total allocated', value: `${formatToken(totalAllocated)} UKI`, icon: ShieldCheck },
    { label: 'Claimable now', value: `${formatToken(claimable)} UKI`, icon: Wallet },
    { label: 'Released', value: `${formatToken(totalReleased)} UKI`, icon: CheckCircle2 },
    { label: 'Unallocated', value: `${formatToken(unallocated)} UKI`, icon: LockKeyhole },
  ], [claimable, totalAllocated, totalReleased, unallocated]);

  function claimAll() {
    if (!contractAddress) return;
    writeContract({
      address: contractAddress,
      abi: vestingVaultAbi,
      functionName: 'releaseAll',
    });
  }

  function createVesting() {
    if (!contractAddress || !isAddress(beneficiary)) return;
    const start = BigInt(daysFromNow(Number(startDays)));
    const cliff = BigInt(daysFromNow(Number(cliffDays)));
    const duration = BigInt(Number(durationDays) * 24 * 60 * 60);

    writeContract({
      address: contractAddress,
      abi: vestingVaultAbi,
      functionName: 'createVestingWithCliff',
      args: [
        beneficiary,
        keccak256(toBytes(scheduleId)),
        parseUnits(amount || '0', 18),
        start,
        cliff,
        duration,
      ],
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
              Claim vested UKI, monitor locked allocations and create cliff-based schedules for team, advisors and ecosystem buckets.
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

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="rounded-lg border border-white/10 bg-[#101b19]/90 p-5 shadow-xl shadow-black/25">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="font-headline text-2xl font-semibold text-white">My vesting position</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {isConnected ? address : 'Connect a wallet to read your live schedule.'}
                </p>
              </div>
              <Button
                onClick={claimAll}
                disabled={!isConfigured || !isConnected || isPending || !claimable || claimable === BigInt(0)}
                className="bg-[#008080] text-white hover:bg-[#009999]"
              >
                Claim UKI
              </Button>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[220px_1fr]">
              <div className="flex aspect-square items-center justify-center rounded-lg border border-teal-300/20 bg-teal-300/5">
                <div className="text-center">
                  <div className="text-5xl font-bold text-[#44edd6]">{progress}%</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">released</div>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-5">
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#44edd6]" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-400">Allocated</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatToken(totalAmount)} UKI</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Locked</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatToken(lockedAmount)} UKI</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Cliff</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatDate(schedule?.[3])}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                  <CalendarClock className="h-4 w-4" />
                  Next vesting end: {formatDate(schedule ? schedule[2] + schedule[4] : undefined)}
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-white/10 bg-[#172522]/90 p-5 shadow-xl shadow-black/25">
            <h2 className="font-headline text-xl font-semibold text-white">Allocation tools</h2>
            <div className="mt-4 grid gap-3">
              <Input placeholder="Beneficiary 0x..." value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Schedule" value={scheduleId} onChange={(event) => setScheduleId(event.target.value.toUpperCase())} />
                <Input placeholder="Amount UKI" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input placeholder="Start days" value={startDays} onChange={(event) => setStartDays(event.target.value)} />
                <Input placeholder="Cliff days" value={cliffDays} onChange={(event) => setCliffDays(event.target.value)} />
                <Input placeholder="Duration days" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
              </div>
              <Button onClick={createVesting} disabled={!isConfigured || !isAddress(beneficiary) || isPending} className="mt-1 bg-white text-[#172522] hover:bg-slate-200">
                <Plus className="mr-2 h-4 w-4" />
                Create vesting
              </Button>
            </div>
          </aside>
        </div>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-[#101b19]/90 shadow-xl shadow-black/25">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="font-headline text-xl font-semibold text-white">Vesting schedules</h2>
            <span className="text-xs uppercase tracking-[0.16em] text-slate-400">operational buckets</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Schedule</th>
                  <th className="px-5 py-3">Allocation</th>
                  <th className="px-5 py-3">Released</th>
                  <th className="px-5 py-3">Claimable</th>
                  <th className="px-5 py-3">Start</th>
                  <th className="px-5 py-3">Cliff</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-slate-200">
                {scheduleRows.map((row, index) => (
                  <tr key={row.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-4 font-semibold text-white">{row.label}</td>
                    <td className="px-5 py-4">{index === 0 ? formatToken(totalAmount) : row.allocation}</td>
                    <td className="px-5 py-4">{index === 0 ? `${formatToken(releasedAmount)} UKI` : '-'}</td>
                    <td className="px-5 py-4">{index === 0 ? `${formatToken(claimable)} UKI` : '-'}</td>
                    <td className="px-5 py-4">{index === 0 ? formatDate(schedule?.[2]) : 'Configured by admin'}</td>
                    <td className="px-5 py-4">{index === 0 ? formatDate(schedule?.[3]) : 'Required'}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-2.5 py-1 text-xs font-semibold text-teal-100">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
  );
}
