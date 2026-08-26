import { UkiStakingPanel } from '@/components/cukie-master/uki-staking-panel';

export function CukieMasterWorkspace({ testnetOnly = false }: { testnetOnly?: boolean }) {
  return <UkiStakingPanel testnetOnly={testnetOnly} />;
}
