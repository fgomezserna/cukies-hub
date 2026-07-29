import { createCompetitionConfig, type CompetitionConfig } from '..';

export type CompetitionRuntimePhase =
  | 'unconfigured'
  | 'disabled'
  | 'scheduled'
  | 'active'
  | 'closed';

export interface CompetitionRuntime {
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly phase: CompetitionRuntimePhase;
  readonly campaign: CompetitionConfig | null;
  readonly issues: readonly string[];
}

type CompetitionEnvironment = Partial<Record<string, string | undefined>>;

function value(environment: CompetitionEnvironment, key: string) {
  const candidate = environment[key]?.trim();
  return candidate || null;
}

export function resolveCompetitionRuntime(
  environment: CompetitionEnvironment = process.env,
  now = new Date(),
): CompetitionRuntime {
  const campaignId = value(environment, 'TREASURE_HUNT_COMPETITION_ID');
  const startsAt = value(environment, 'TREASURE_HUNT_COMPETITION_STARTS_AT');
  const endsAt = value(environment, 'TREASURE_HUNT_COMPETITION_ENDS_AT');
  const rulesVersion = value(environment, 'TREASURE_HUNT_COMPETITION_RULES_VERSION') ?? '1';
  const presaleContractAddress = value(
    environment,
    'TREASURE_HUNT_COMPETITION_PRESALE_ADDRESS',
  ) ?? value(environment, 'CHAIN_INDEXER_PRESALE_ADDRESS')
    ?? value(environment, 'NEXT_PUBLIC_UKI_PRESALE_ADDRESS');
  const issues: string[] = [];

  if (!campaignId) issues.push('TREASURE_HUNT_COMPETITION_ID is missing');
  if (!startsAt) issues.push('TREASURE_HUNT_COMPETITION_STARTS_AT is missing');
  if (!endsAt) issues.push('TREASURE_HUNT_COMPETITION_ENDS_AT is missing');
  if (!presaleContractAddress) {
    issues.push('TREASURE_HUNT_COMPETITION_PRESALE_ADDRESS is missing');
  }
  if (issues.length > 0) {
    return {
      configured: false,
      enabled: false,
      phase: 'unconfigured',
      campaign: null,
      issues,
    };
  }

  let campaign: CompetitionConfig;
  try {
    campaign = createCompetitionConfig({
      campaignId: campaignId as string,
      rulesVersion,
      presaleContractAddress: presaleContractAddress as string,
      startsAt: startsAt as string,
      endsAt: endsAt as string,
    });
  } catch (error) {
    return {
      configured: false,
      enabled: false,
      phase: 'unconfigured',
      campaign: null,
      issues: [error instanceof Error ? error.message : 'Invalid competition configuration'],
    };
  }

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error('Competition runtime requires a valid current date');
  }
  const startsAtMs = Date.parse(campaign.startsAt);
  const endsAtMs = Date.parse(campaign.endsAt);
  const enabled = value(environment, 'TREASURE_HUNT_COMPETITION_ENABLED') === 'true';
  // The enable flag is a pre-close kill switch, not a way to reopen immutable
  // history. After the window ends aliases stay locked and settlement remains
  // reachable even if operations disable new competition traffic.
  if (nowMs > endsAtMs) {
    return { configured: true, enabled, phase: 'closed', campaign, issues };
  }
  if (!enabled) {
    return { configured: true, enabled: false, phase: 'disabled', campaign, issues };
  }
  const phase: CompetitionRuntimePhase = nowMs < startsAtMs
    ? 'scheduled'
    : 'active';

  return { configured: true, enabled: true, phase, campaign, issues };
}

export function getCompetitionProofSecret(
  environment: CompetitionEnvironment = process.env,
) {
  const dedicated = value(environment, 'TREASURE_HUNT_COMPETITION_PROOF_SECRET');
  if (dedicated) {
    if (dedicated.length < 32) {
      throw new Error('TREASURE_HUNT_COMPETITION_PROOF_SECRET must contain at least 32 characters');
    }
    return dedicated;
  }

  if (environment.NODE_ENV === 'production') {
    throw new Error('TREASURE_HUNT_COMPETITION_PROOF_SECRET is required in production');
  }

  return value(environment, 'NEXTAUTH_SECRET')
    ?? value(environment, 'AUTH_SECRET')
    ?? 'cukies-treasure-hunt-local-proof-secret';
}
