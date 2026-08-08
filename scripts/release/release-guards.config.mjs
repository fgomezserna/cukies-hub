export const RELEASE_GUARDS_REPOSITORY = 'fgomezserna/cukies-hub';
export const RELEASE_GUARDS_CONFIRMATION = 'APPLY_RELEASE_GUARDS_AFTER_FREEZE';
export const CI_CONTEXT_PLACEHOLDER = '__REPLACE_WITH_EXISTING_REQUIRED_CI_CONTEXT__';
export const MANAGED_RELEASE_CONTEXTS = Object.freeze([
  'release/staging-deployed',
  'release/staging-validated',
  'release/promotion-gate',
]);

export const RELEASE_GUARD_PHASES = Object.freeze({
  'bootstrap-lock': Object.freeze({
    description: 'Freeze main read-only and lock direct pushes before release tooling exists.',
    mainContexts: Object.freeze([]),
    preconditions: Object.freeze([
      'Run this read-only main freeze plus PR/review/admin lock before merging tooling to staging.',
      'No new release status is required because those workflows do not exist yet.',
      'Inspect the dry-run and preserve any existing CI policy operationally.',
    ]),
  }),
  'bootstrap-attested': Object.freeze({
    description: 'Replace the main freeze with verified staging attestations for the first promotion.',
    mainContexts: Object.freeze([
      'release/staging-deployed',
      'release/staging-validated',
    ]),
    preconditions: Object.freeze([
      'The release tooling is already merged and deployed from staging.',
      'A dedicated release GitHub App is installed and its key is scoped to protected environments.',
      'Both staging attestations exist on the exact candidate SHA.',
      'The app-bound CI quality check is green on the exact staging candidate SHA.',
      'main is an ancestor of that candidate SHA.',
      'The first staging -> main PR is reviewed manually because pull_request_target is not active yet.',
    ]),
  }),
  'steady-state': Object.freeze({
    description: 'Enable the permanent promotion gate after the first promotion reaches main.',
    mainContexts: Object.freeze([
      'release/promotion-gate',
      CI_CONTEXT_PLACEHOLDER,
    ]),
    preconditions: Object.freeze([
      'The main-promotion-gate workflow exists on the default main branch.',
      'The dedicated release GitHub App is bound to every release/* requirement.',
      'Staging and Release Gate require review plus exact staging/main custom branch policies.',
      'The CI placeholder is replaced by an existing required CI context.',
      'The bootstrap-protected first promotion has already completed.',
    ]),
  }),
});

function normalizeExistingRequirements(value) {
  if (Array.isArray(value)) {
    return { contexts: [...value], checks: [] };
  }
  const rawChecks = [...(value?.checks ?? [])].map((check) => ({ ...check }));
  return {
    contexts: [
      ...(value?.contexts ?? []),
      ...rawChecks.filter(({ app_id: appId }) => appId === null).map(({ context }) => context),
    ],
    checks: rawChecks.filter(({ app_id: appId }) => appId !== null),
  };
}

function uniqueContexts(contexts) {
  return [...new Set(contexts)];
}

function uniqueChecks(checks) {
  const seen = new Set();
  return checks.filter((check) => {
    const key = `${check.context}\0${String(check.app_id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function protection({ contexts, checks, linearHistory, lockBranch = false }) {
  const hasRequirements = contexts.length > 0 || checks.length > 0;
  return {
    required_status_checks: hasRequirements
      ? {
          strict: true,
          contexts: [...contexts],
          checks: checks.map((check) => ({ ...check })),
        }
      : null,
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      required_approving_review_count: 1,
      require_last_push_approval: true,
    },
    restrictions: null,
    required_linear_history: linearHistory,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    lock_branch: lockBranch,
    allow_fork_syncing: false,
  };
}

export function buildReleaseGuardPlan({
  phase = 'bootstrap-lock',
  repository = RELEASE_GUARDS_REPOSITORY,
  ciContext,
  ciRequirement,
  releaseAppId,
  existingContexts = { main: { contexts: [], checks: [] }, staging: { contexts: [], checks: [] } },
} = {}) {
  const phaseConfig = RELEASE_GUARD_PHASES[phase];
  if (!phaseConfig) {
    throw new Error(`Unknown release guard phase: ${phase}.`);
  }
  if (
    ciRequirement !== undefined
    && (
      ciRequirement?.kind !== 'check'
      || typeof ciRequirement.context !== 'string'
      || ciRequirement.context === ''
      || !Number.isSafeInteger(ciRequirement.appId)
      || ciRequirement.appId <= 0
    )
  ) {
    throw new Error('ciRequirement must be an app-bound check resolved by the apply preflight.');
  }
  if (phase === 'bootstrap-attested' && ciRequirement === undefined) {
    throw new Error('bootstrap-attested requires the app-bound staging CI check.');
  }

  const existingMain = normalizeExistingRequirements(existingContexts.main);
  const existingStaging = normalizeExistingRequirements(existingContexts.staging);
  const ciRequirementContext = ciRequirement?.context;
  const preservedMainContexts = existingMain.contexts
    .filter((context) => !MANAGED_RELEASE_CONTEXTS.includes(context));
  const preservedMainChecks = existingMain.checks
    .filter((check) => !MANAGED_RELEASE_CONTEXTS.includes(check.context));
  const managedPhaseContexts = phaseConfig.mainContexts
    .filter((context) => context.startsWith('release/'));
  if (
    managedPhaseContexts.length > 0
    && (!Number.isSafeInteger(releaseAppId) || releaseAppId <= 0 || releaseAppId === 15368)
  ) {
    throw new Error('releaseAppId must identify a dedicated GitHub App, never GitHub Actions.');
  }
  if (phase !== 'bootstrap-lock' && ciRequirement && ciRequirement.appId !== releaseAppId) {
    throw new Error('The required CI check must use the dedicated release GitHub App.');
  }
  const plainPhaseContexts = phaseConfig.mainContexts
    .filter((context) => !context.startsWith('release/'));
  let mainContexts = [...preservedMainContexts, ...plainPhaseContexts];
  let mainChecks = [
    ...preservedMainChecks,
    ...managedPhaseContexts.map((context) => ({ context, app_id: releaseAppId })),
  ];
  if (phase === 'steady-state' && ciRequirementContext) {
    const resolvedCiContext = ciRequirementContext;
    mainContexts = mainContexts
      .filter((context) => context !== resolvedCiContext)
      .map((context) => context === CI_CONTEXT_PLACEHOLDER ? resolvedCiContext : context);
    mainChecks = mainChecks.filter((check) => check.context !== resolvedCiContext);
    mainContexts = mainContexts.filter((context) => context !== resolvedCiContext);
    mainChecks.push({ context: resolvedCiContext, app_id: ciRequirement.appId });
  }
  mainContexts = uniqueContexts(mainContexts);
  mainChecks = uniqueChecks(mainChecks);
  const mainCheckContexts = new Set(mainChecks.map(({ context }) => context));
  mainContexts = mainContexts.filter((context) => !mainCheckContexts.has(context));
  let stagingChecks = [...existingStaging.checks];
  let stagingContexts = [...existingStaging.contexts];
  if (
    (phase === 'bootstrap-attested' || phase === 'steady-state')
    && ciRequirementContext
  ) {
    stagingChecks = stagingChecks.filter((check) => check.context !== ciRequirementContext);
    stagingContexts = stagingContexts.filter((context) => context !== ciRequirementContext);
    stagingChecks.push({ context: ciRequirementContext, app_id: ciRequirement.appId });
  }
  stagingChecks = uniqueChecks(stagingChecks);
  const stagingCheckContexts = new Set(stagingChecks.map(({ context }) => context));
  stagingContexts = uniqueContexts(stagingContexts)
    .filter((context) => !stagingCheckContexts.has(context));

  return {
    mode: 'dry-run-by-default',
    phase,
    repository,
    requestedCiContext: ciContext ?? null,
    description: phaseConfig.description,
    preconditions: [...phaseConfig.preconditions],
    branches: {
      main: protection({
        contexts: mainContexts,
        checks: mainChecks,
        linearHistory: true,
        lockBranch: phase === 'bootstrap-lock',
      }),
      staging: protection({ contexts: stagingContexts, checks: stagingChecks, linearHistory: false }),
    },
  };
}
