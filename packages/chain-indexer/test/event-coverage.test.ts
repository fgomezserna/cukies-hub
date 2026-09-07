import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseAbiItem, type AbiEvent } from 'viem';

import {
  bscEventAbis,
  eventSignatures,
  tronEventSignatures,
} from '../src/config/abis.js';
import { getContractEventConfigs } from '../src/config/contracts.js';
import {
  canonicalEventsForAlias,
  contractEventManifest,
} from '../src/config/event-manifest.js';
import { parseContractAliases } from '../src/config/env.js';
import type { ContractAlias, EventName } from '../src/types.js';

const repoRoot = path.resolve(import.meta.dirname, '../..', '..');
const legacyAbiRoot = path.join(repoRoot, 'docs/legacy-marketplace/abis');
const artifactRoot = path.join(repoRoot, 'packages/contracts/artifacts/contracts');

function loadJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function eventInputs(event: any) {
  return (event.inputs ?? []).map((input: any) => ({
    type: input.type,
    indexed: input.indexed === true,
  }));
}

function fixtureEvents(filePath: string) {
  const abi = loadJson(filePath) as any[];
  return abi.filter((item) => item.type === 'event' || item.type === 'Event');
}

function signatureEvent(eventName: EventName, chain: 'BSC' | 'TRON'): AbiEvent {
  const signature = chain === 'TRON'
    ? (tronEventSignatures[eventName] ?? eventSignatures[eventName])
    : eventSignatures[eventName];
  return parseAbiItem(signature) as AbiEvent;
}

test('legacy 14 ABI fixtures match manifest, canonical config and indexed shapes', () => {
  const fixtureAliases: Record<'BSC' | 'TRON', Record<string, ContractAlias>> = {
    BSC: {
      token: 'TOKEN', points: 'POINTS', stakingPoints: 'STAKING_POINTS',
      breedingPoints: 'BREEDING_POINTS', marketplace: 'MARKETPLACE', bridge: 'BRIDGE',
    },
    TRON: {
      token: 'TOKEN', mint: 'MINT', referrals: 'REFERRALS', points: 'POINTS',
      stakingPoints: 'STAKING_POINTS', breedingPoints: 'BREEDING_POINTS',
      marketplace: 'MARKETPLACE', bridge: 'BRIDGE',
    },
  };

  for (const chain of ['BSC', 'TRON'] as const) {
    for (const [stem, alias] of Object.entries(fixtureAliases[chain])) {
      const fixturePath = path.join(legacyAbiRoot, chain.toLowerCase(), `${stem}.abi.json`);
      const fixture = fixtureEvents(fixturePath);
      const manifest = contractEventManifest[alias] ?? [];
      assert.deepEqual(
        fixture.map((item) => item.name).sort(),
        manifest.map((item) => item.artifactEvent).sort(),
        `${chain}:${alias} fixture/manifest event set drift`,
      );

      const options = chain === 'BSC'
        ? {
            tokenAddress: `0x${'1'.repeat(40)}`,
            marketplaceAddress: `0x${'2'.repeat(40)}`,
            bridgeAddress: `0x${'3'.repeat(40)}`,
            contractAliases: [alias],
          }
        : { contractAliases: [alias] };
      const configs = getContractEventConfigs([chain], options);
      assert.deepEqual(
        configs.map((item) => item.eventName).sort(),
        canonicalEventsForAlias(alias).slice().sort(),
        `${chain}:${alias} config/manifest event set drift`,
      );

      for (const item of fixture) {
        const manifestEntry = manifest.find((entry) => entry.artifactEvent === item.name);
        assert.ok(manifestEntry, `${chain}:${alias}:${item.name} missing manifest entry`);
        const canonical = manifestEntry.canonicalEvent;
        assert.deepEqual(
          eventInputs(item),
          eventInputs(signatureEvent(canonical, chain)),
          `${chain}:${alias}:${item.name} type/indexed drift`,
        );
      }
    }
  }
});

test('compiled new artifacts are exact manifest coverage, including inherited events', () => {
  const artifacts: Record<ContractAlias, string> = {
    TOKEN_V2: 'StagingCukiesNftV2',
    UKI_TOKEN: 'UKIToken',
    UKI_MARKETPLACE: 'CukiesMarketplace',
    BRIDGE_ENDPOINT: 'CukiesBridgeEndpoint',
    PRESALE: 'Presale',
    UKI_STAKING: 'UKIStaking',
    VESTING_VAULT: 'VestingVault',
    REWARDS_DISTRIBUTOR: 'RewardsDistributor',
    CUKIE_MASTER_NFT_VAULT: 'CukieMasterNftVault',
    CUKIE_POOL_NFT_VAULT: 'CukiePoolNftVault',
  } as Record<ContractAlias, string>;
  const addresses = Object.fromEntries(
    Object.keys(artifacts).map((alias, index) => [alias, `0x${String(index + 1).padStart(40, '0')}`]),
  ) as Record<string, string>;
  const aliases = Object.keys(artifacts) as ContractAlias[];
  const configs = getContractEventConfigs(['BSC'], {
    tokenV2Address: addresses.TOKEN_V2,
    ukiTokenAddress: addresses.UKI_TOKEN,
    ukiMarketplaceAddress: addresses.UKI_MARKETPLACE,
    bridgeEndpointAddress: addresses.BRIDGE_ENDPOINT,
    presaleAddress: addresses.PRESALE,
    ukiStakingAddress: addresses.UKI_STAKING,
    vestingVaultAddress: addresses.VESTING_VAULT,
    rewardsDistributorAddress: addresses.REWARDS_DISTRIBUTOR,
    cukieMasterNftVaultAddress: addresses.CUKIE_MASTER_NFT_VAULT,
    cukiePoolNftVaultAddress: addresses.CUKIE_POOL_NFT_VAULT,
    contractAliases: aliases,
  });

  for (const alias of aliases) {
    const artifactName = artifacts[alias];
    const artifactPath = path.join(artifactRoot, `${artifactName}.sol`, `${artifactName}.json`);
    const artifactEvents = (loadJson(artifactPath).abi as any[])
      .filter((item) => item.type === 'event');
    const manifest = contractEventManifest[alias] ?? [];
    assert.deepEqual(
      artifactEvents.map((item) => item.name).sort(),
      manifest.map((item) => item.artifactEvent).sort(),
      `${alias} compiled ABI/manifest event set drift`,
    );
    const configNames = configs
      .filter((item) => item.contractAlias === alias)
      .map((item) => item.eventName)
      .sort();
    assert.deepEqual(configNames, canonicalEventsForAlias(alias).slice().sort(), `${alias} config drift`);
    for (const artifactEvent of artifactEvents) {
      const manifestEntry = manifest.find((entry) => entry.artifactEvent === artifactEvent.name)!;
      const canonical = manifestEntry.canonicalEvent;
      assert.deepEqual(
        eventInputs(artifactEvent),
        eventInputs(bscEventAbis[canonical]),
        `${alias}:${artifactEvent.name} type/indexed drift`,
      );
    }
  }
});

test('new aliases are explicit CLI opt-in and never route UKI ERC20 events through NFT names', () => {
  assert.deepEqual(parseContractAliases('bridge_endpoint, mint, referrals, uki_token'), [
    'BRIDGE_ENDPOINT', 'MINT', 'REFERRALS', 'UKI_TOKEN',
  ]);
  const address = `0x${'a'.repeat(40)}`;
  const withoutOptIn = getContractEventConfigs(['BSC'], { ukiTokenAddress: address });
  assert.equal(withoutOptIn.some((item) => item.contractAlias === 'UKI_TOKEN'), false);
  const withOptIn = getContractEventConfigs(['BSC'], {
    ukiTokenAddress: address,
    contractAliases: ['UKI_TOKEN'],
  });
  assert.deepEqual(withOptIn.map((item) => item.eventName), [
    'UkiTokenTransfer', 'UkiTokenApproval', 'UkiTokenOwnershipTransferred',
    'UkiTokenPaused', 'UkiTokenUnpaused',
  ]);
  assert.equal(withOptIn.some((item) => item.eventName === 'Transfer'), false);
  assert.equal(withOptIn.some((item) => item.eventName === 'Approval'), false);
});
