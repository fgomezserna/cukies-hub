#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CI_CONTEXT_PLACEHOLDER,
  RELEASE_GUARDS_CONFIRMATION,
  RELEASE_GUARDS_REPOSITORY,
  RELEASE_GUARD_PHASES,
  buildReleaseGuardPlan,
} from './release-guards.config.mjs';
import { verifyAttestations } from './verify-attestations.mjs';

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const APP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const PROMOTION_WORKFLOW_PATH = '.github/workflows/main-promotion-gate.yml';

export class ReleaseGuardConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseGuardConfigurationError';
  }
}

function validateRepository(value) {
  if (
    typeof value !== 'string'
    || !REPOSITORY_PATTERN.test(value)
    || value.split('/').some((part) => part.includes('..'))
  ) {
    throw new ReleaseGuardConfigurationError('Repository must have the exact owner/repo form.');
  }
  return value;
}

function validateApiUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ReleaseGuardConfigurationError('GitHub API URL is invalid.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    throw new ReleaseGuardConfigurationError('GitHub API URL must be credential-free HTTPS.');
  }
  return parsed.href.replace(/\/+$/, '');
}

function validateCiContext(value) {
  if (
    typeof value !== 'string'
    || value.trim() !== value
    || value === ''
    || value === CI_CONTEXT_PLACEHOLDER
    || value.length > 100
    || /[\r\n]/.test(value)
    || value.startsWith('release/')
  ) {
    throw new ReleaseGuardConfigurationError(
      'steady-state apply requires an explicit existing non-release CI context.',
    );
  }
  return value;
}

function validateReleaseAppId(value) {
  const parsed = typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value)
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed === 15368) {
    throw new ReleaseGuardConfigurationError(
      'A positive dedicated --release-app-id is required; GitHub Actions app id 15368 is forbidden.',
    );
  }
  return parsed;
}

function validateReleaseAppSlug(value) {
  if (
    typeof value !== 'string'
    || !APP_SLUG_PATTERN.test(value)
    || value === 'github-actions'
  ) {
    throw new ReleaseGuardConfigurationError(
      'A valid dedicated --release-app-slug is required; github-actions is forbidden.',
    );
  }
  return value;
}

function parseArguments(argv) {
  const parsed = { apply: false, phase: 'bootstrap-lock' };
  const values = new Map([
    ['--phase', 'phase'],
    ['--repository', 'repository'],
    ['--candidate-sha', 'candidateSha'],
    ['--ci-context', 'ciContext'],
    ['--release-app-id', 'releaseAppId'],
    ['--release-app-slug', 'releaseAppSlug'],
    ['--confirm', 'confirmation'],
    ['--api-url', 'apiBaseUrl'],
  ]);
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      parsed.help = true;
      continue;
    }
    if (argument === '--apply') {
      if (parsed.apply) {
        throw new ReleaseGuardConfigurationError('--apply cannot be repeated.');
      }
      parsed.apply = true;
      continue;
    }

    const property = values.get(argument);
    if (!property || seen.has(argument)) {
      throw new ReleaseGuardConfigurationError(`Unknown or repeated argument: ${argument}.`);
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new ReleaseGuardConfigurationError(`Missing value for ${argument}.`);
    }
    parsed[property] = value;
    seen.add(argument);
    index += 1;
  }

  if (!Object.hasOwn(RELEASE_GUARD_PHASES, parsed.phase)) {
    throw new ReleaseGuardConfigurationError(
      'Phase must be bootstrap-lock, bootstrap-attested or steady-state.',
    );
  }
  return parsed;
}

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  };
}

async function fetchJson(url, options, { fetchFn, expectedStatus = 200, operation }) {
  let response;
  try {
    response = await fetchFn(url, { ...options, redirect: 'error' });
  } catch {
    throw new ReleaseGuardConfigurationError(`${operation} failed with a network error.`);
  }
  if (!response || response.status !== expectedStatus) {
    const status = Number.isInteger(response?.status) ? `HTTP ${response.status}` : 'invalid HTTP';
    throw new ReleaseGuardConfigurationError(`${operation} failed with ${status}.`);
  }
  if (typeof response.json !== 'function') {
    throw new ReleaseGuardConfigurationError(`${operation} returned an invalid response.`);
  }
  try {
    return await response.json();
  } catch {
    throw new ReleaseGuardConfigurationError(`${operation} returned invalid JSON.`);
  }
}

async function readExistingProtection({ apiBaseUrl, repository, branch, token, fetchFn }) {
  const [owner, repo] = repository.split('/').map(encodeURIComponent);
  const branchPayload = await fetchJson(
    `${apiBaseUrl}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    { method: 'GET', headers: headers(token), cache: 'no-store' },
    { fetchFn, operation: `Branch preflight for ${branch}` },
  );
  if (
    !branchPayload
    || branchPayload.name !== branch
    || typeof branchPayload.commit?.sha !== 'string'
    || !FULL_GIT_SHA_PATTERN.test(branchPayload.commit.sha)
  ) {
    throw new ReleaseGuardConfigurationError(`Branch preflight for ${branch} is invalid.`);
  }

  let response;
  try {
    response = await fetchFn(
      `${apiBaseUrl}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
      { method: 'GET', headers: headers(token), cache: 'no-store', redirect: 'error' },
    );
  } catch {
    throw new ReleaseGuardConfigurationError(
      `Protection preflight for ${branch} failed with a network error.`,
    );
  }
  if (response?.status === 404) {
    return {
      sha: branchPayload.commit.sha,
      requirements: { contexts: [], checks: [] },
    };
  }
  if (!response || response.status !== 200 || typeof response.json !== 'function') {
    const status = Number.isInteger(response?.status) ? `HTTP ${response.status}` : 'invalid HTTP';
    throw new ReleaseGuardConfigurationError(
      `Protection preflight for ${branch} failed with ${status}.`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ReleaseGuardConfigurationError(
      `Protection preflight for ${branch} returned invalid JSON.`,
    );
  }
  const requiredChecks = payload?.required_status_checks;
  if (requiredChecks === null || requiredChecks === undefined) {
    return {
      sha: branchPayload.commit.sha,
      requirements: { contexts: [], checks: [] },
    };
  }
  if (typeof requiredChecks !== 'object' || Array.isArray(requiredChecks)) {
    throw new ReleaseGuardConfigurationError(
      `Protection preflight for ${branch} has invalid required status checks.`,
    );
  }

  const contexts = [];
  if (requiredChecks.contexts !== undefined) {
    if (
      !Array.isArray(requiredChecks.contexts)
      || requiredChecks.contexts.some((context) => typeof context !== 'string' || context === '')
    ) {
      throw new ReleaseGuardConfigurationError(
        `Protection preflight for ${branch} has invalid status contexts.`,
      );
    }
    contexts.push(...requiredChecks.contexts);
  }
  if (requiredChecks.checks !== undefined) {
    if (
      !Array.isArray(requiredChecks.checks)
      || requiredChecks.checks.some((check) =>
        !check
        || typeof check !== 'object'
        || typeof check.context !== 'string'
        || check.context === ''
        || !Object.hasOwn(check, 'app_id')
        || !(check.app_id === null || (Number.isSafeInteger(check.app_id) && check.app_id > 0)))
    ) {
      throw new ReleaseGuardConfigurationError(
        `Protection preflight for ${branch} has invalid status checks.`,
      );
    }
  }
  const rawChecks = requiredChecks.checks ?? [];
  const checks = rawChecks
    .filter(({ app_id: appId }) => appId !== null)
    .map(({ context, app_id: appId }) => ({ context, app_id: appId }));
  contexts.push(...rawChecks
    .filter(({ app_id: appId }) => appId === null)
    .map(({ context }) => context));
  const checkContexts = new Set(checks.map(({ context }) => context));
  return {
    sha: branchPayload.commit.sha,
    requirements: {
      // GitHub returns `contexts` as a compatibility view of `checks`. Keep the
      // app-bound object authoritative so a later PUT never downgrades its app_id.
      contexts: [...new Set(contexts.filter((context) => !checkContexts.has(context)))],
      checks,
    },
  };
}

async function verifyProtectedEnvironment({
  apiBaseUrl,
  repository,
  environmentName,
  expectedBranch,
  token,
  fetchFn,
}) {
  const [owner, repo] = repository.split('/').map(encodeURIComponent);
  const payload = await fetchJson(
    `${apiBaseUrl}/repos/${owner}/${repo}/environments/${encodeURIComponent(environmentName)}`,
    { method: 'GET', headers: headers(token), cache: 'no-store' },
    { fetchFn, operation: `${environmentName} environment trust preflight` },
  );
  const reviewerRule = Array.isArray(payload?.protection_rules)
    ? payload.protection_rules.find((rule) => rule?.type === 'required_reviewers')
    : undefined;
  const branchPolicy = payload?.deployment_branch_policy;
  if (
    payload?.name !== environmentName
    || !reviewerRule
    || reviewerRule.prevent_self_review !== true
    || !Array.isArray(reviewerRule.reviewers)
    || reviewerRule.reviewers.length === 0
    || branchPolicy?.protected_branches !== false
    || branchPolicy?.custom_branch_policies !== true
  ) {
    throw new ReleaseGuardConfigurationError(
      `${environmentName} environment must require reviewers, prevent self-review, and use custom branch policies before release gates are enabled.`,
    );
  }

  const policies = await fetchJson(
    `${apiBaseUrl}/repos/${owner}/${repo}/environments/${encodeURIComponent(environmentName)}/deployment-branch-policies?per_page=100`,
    { method: 'GET', headers: headers(token), cache: 'no-store' },
    { fetchFn, operation: `${environmentName} branch policy preflight` },
  );
  if (
    policies?.total_count !== 1
    || !Array.isArray(policies.branch_policies)
    || policies.branch_policies.length !== 1
    || policies.branch_policies[0]?.name !== expectedBranch
    || policies.branch_policies[0]?.type !== 'branch'
  ) {
    throw new ReleaseGuardConfigurationError(
      `${environmentName} environment must allow exactly the ${expectedBranch} branch.`,
    );
  }
}

async function verifyDedicatedReleaseApp({
  apiBaseUrl,
  releaseAppId,
  releaseAppSlug,
  token,
  fetchFn,
}) {
  const payload = await fetchJson(
    `${apiBaseUrl}/apps/${encodeURIComponent(releaseAppSlug)}`,
    { method: 'GET', headers: headers(token), cache: 'no-store' },
    { fetchFn, operation: 'Dedicated release GitHub App preflight' },
  );
  if (
    payload?.id !== releaseAppId
    || payload.slug !== releaseAppSlug
    || payload.slug === 'github-actions'
  ) {
    throw new ReleaseGuardConfigurationError(
      'Dedicated release GitHub App preflight did not resolve the expected immutable identity.',
    );
  }
  return payload.id;
}

async function verifyCiContextOnSha({
  apiBaseUrl,
  repository,
  candidateSha,
  ciContext,
  token,
  fetchFn,
}) {
  const [owner, repo] = repository.split('/').map(encodeURIComponent);
  const encodedContext = encodeURIComponent(ciContext);
  const checkRunsPayload = await fetchJson(
    `${apiBaseUrl}/repos/${owner}/${repo}/commits/${candidateSha}/check-runs?check_name=${encodedContext}&filter=latest&per_page=100`,
    { method: 'GET', headers: headers(token), cache: 'no-store' },
    { fetchFn, operation: 'CI check-runs preflight' },
  );
  if (
    !Number.isSafeInteger(checkRunsPayload?.total_count)
    || checkRunsPayload.total_count < 0
    || !Array.isArray(checkRunsPayload.check_runs)
    || checkRunsPayload.total_count !== checkRunsPayload.check_runs.length
    || checkRunsPayload.check_runs.length > 100
  ) {
    throw new ReleaseGuardConfigurationError('CI check-runs preflight returned an incomplete payload.');
  }
  const matchingChecks = checkRunsPayload.check_runs.filter((check) => check?.name === ciContext);
  for (const check of matchingChecks) {
    if (
      !Number.isSafeInteger(check.id)
      || check.id <= 0
      || check.head_sha !== candidateSha
      || !check.app
      || !Number.isSafeInteger(check.app.id)
      || check.app.id <= 0
    ) {
      throw new ReleaseGuardConfigurationError('CI check-runs preflight returned an invalid check.');
    }
  }

  if (matchingChecks.length === 0) {
    throw new ReleaseGuardConfigurationError(
      'The selected CI context is not an app-bound check on current main.',
    );
  }
  const appIds = new Set(matchingChecks.map((check) => check.app.id));
  if (appIds.size !== 1) {
    throw new ReleaseGuardConfigurationError(
      'The selected CI check is ambiguous across multiple GitHub Apps.',
    );
  }
  const latestCheck = matchingChecks.reduce((latest, check) => check.id > latest.id ? check : latest);
  if (latestCheck.status !== 'completed' || latestCheck.conclusion !== 'success') {
    throw new ReleaseGuardConfigurationError(
      'The latest selected CI check is not completed successfully on current main.',
    );
  }
  return { kind: 'check', context: ciContext, appId: latestCheck.app.id };
}

async function verifyPromotionWorkflowOnMain({ apiBaseUrl, repository, token, fetchFn }) {
  const [owner, repo] = repository.split('/').map(encodeURIComponent);
  const payload = await fetchJson(
    `${apiBaseUrl}/repos/${owner}/${repo}/contents/${PROMOTION_WORKFLOW_PATH}?ref=main`,
    { method: 'GET', headers: headers(token), cache: 'no-store' },
    { fetchFn, operation: 'Promotion workflow preflight' },
  );
  if (
    !payload
    || payload.type !== 'file'
    || payload.path !== PROMOTION_WORKFLOW_PATH
    || typeof payload.sha !== 'string'
    || !/^[0-9a-f]{40}$/.test(payload.sha)
  ) {
    throw new ReleaseGuardConfigurationError(
      'Promotion workflow preflight did not find the expected file on main.',
    );
  }
}

async function putProtection({ apiBaseUrl, repository, branch, protection, token, fetchFn }) {
  const [owner, repo] = repository.split('/').map(encodeURIComponent);
  await fetchJson(
    `${apiBaseUrl}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(protection),
    },
    { fetchFn, operation: `Protection update for ${branch}` },
  );
}

export async function applyReleaseGuardPlan({
  phase,
  repository,
  candidateSha,
  ciContext,
  releaseAppId,
  releaseAppSlug,
  confirmation,
  token,
  apiBaseUrl,
  fetchFn,
} = {}) {
  if (confirmation !== RELEASE_GUARDS_CONFIRMATION) {
    throw new ReleaseGuardConfigurationError(
      `Apply requires the literal confirmation ${RELEASE_GUARDS_CONFIRMATION}.`,
    );
  }
  const validatedRepository = validateRepository(repository);
  const validatedApiUrl = validateApiUrl(apiBaseUrl);
  if (typeof token !== 'string' || token.trim() === '' || /[\r\n]/.test(token)) {
    throw new ReleaseGuardConfigurationError('GITHUB_TOKEN is required for apply.');
  }
  if (typeof fetchFn !== 'function') {
    throw new ReleaseGuardConfigurationError('fetch is required for apply.');
  }

  let validatedCiContext;
  let validatedReleaseAppId;
  let validatedReleaseAppSlug;
  if (phase === 'bootstrap-lock') {
    // This first bootstrap step deliberately has no release-status preflight: the workflows do
    // not exist yet. It still installs PR/review/admin/no-force/no-delete protections.
  } else if (phase === 'bootstrap-attested') {
    validatedReleaseAppId = validateReleaseAppId(releaseAppId);
    validatedReleaseAppSlug = validateReleaseAppSlug(releaseAppSlug);
    if (typeof candidateSha !== 'string' || !FULL_GIT_SHA_PATTERN.test(candidateSha)) {
      throw new ReleaseGuardConfigurationError(
        'bootstrap-attested apply requires the exact full staging candidate SHA.',
      );
    }
  } else if (phase === 'steady-state') {
    validatedReleaseAppId = validateReleaseAppId(releaseAppId);
    validatedReleaseAppSlug = validateReleaseAppSlug(releaseAppSlug);
    validatedCiContext = validateCiContext(ciContext);
    if (typeof candidateSha !== 'string' || !FULL_GIT_SHA_PATTERN.test(candidateSha)) {
      throw new ReleaseGuardConfigurationError(
        'steady-state apply requires the exact full current main SHA.',
      );
    }
  } else {
    throw new ReleaseGuardConfigurationError(
      'Phase must be bootstrap-lock, bootstrap-attested or steady-state.',
    );
  }

  const existingContexts = {};
  const branchShas = {};
  for (const branch of ['main', 'staging']) {
    const existing = await readExistingProtection({
      apiBaseUrl: validatedApiUrl,
      repository: validatedRepository,
      branch,
      token,
      fetchFn,
    });
    branchShas[branch] = existing.sha;
    existingContexts[branch] = existing.requirements;
  }

  if (phase === 'bootstrap-attested' && candidateSha !== branchShas.staging) {
    throw new ReleaseGuardConfigurationError(
      '--candidate-sha must equal the SHA currently resolved for staging.',
    );
  }
  if (phase === 'steady-state' && candidateSha !== branchShas.main) {
    throw new ReleaseGuardConfigurationError(
      '--candidate-sha must equal the SHA currently resolved for main.',
    );
  }

  let ciRequirement;
  if (phase !== 'bootstrap-lock') {
    validatedReleaseAppId = await verifyDedicatedReleaseApp({
      apiBaseUrl: validatedApiUrl,
      releaseAppId: validatedReleaseAppId,
      releaseAppSlug: validatedReleaseAppSlug,
      token,
      fetchFn,
    });
  }
  if (phase === 'bootstrap-attested') {
    await verifyAttestations({
      repository: validatedRepository,
      candidateSha,
      token,
      apiBaseUrl: validatedApiUrl,
      fetchFn,
      statusCreatorLogin: `${validatedReleaseAppSlug}[bot]`,
    });
  } else if (phase === 'steady-state') {
    await verifyPromotionWorkflowOnMain({
      apiBaseUrl: validatedApiUrl,
      repository: validatedRepository,
      token,
      fetchFn,
    });
    await verifyProtectedEnvironment({
      apiBaseUrl: validatedApiUrl,
      repository: validatedRepository,
      environmentName: 'Staging',
      expectedBranch: 'staging',
      token,
      fetchFn,
    });
    await verifyProtectedEnvironment({
      apiBaseUrl: validatedApiUrl,
      repository: validatedRepository,
      environmentName: 'Release Gate',
      expectedBranch: 'main',
      token,
      fetchFn,
    });
    ciRequirement = await verifyCiContextOnSha({
      apiBaseUrl: validatedApiUrl,
      repository: validatedRepository,
      candidateSha,
      ciContext: validatedCiContext,
      token,
      fetchFn,
    });
    if (ciRequirement.appId !== validatedReleaseAppId) {
      throw new ReleaseGuardConfigurationError(
        'The required CI check must be emitted by the same dedicated release GitHub App.',
      );
    }
  }

  const plan = buildReleaseGuardPlan({
    phase,
    repository: validatedRepository,
    ciContext: validatedCiContext,
    ciRequirement,
    releaseAppId: validatedReleaseAppId,
    existingContexts,
  });
  // Protect live first. A second PUT failure may leave staging unchanged, but never main exposed.
  for (const branch of ['main', 'staging']) {
    await putProtection({
      apiBaseUrl: validatedApiUrl,
      repository: validatedRepository,
      branch,
      protection: plan.branches[branch],
      token,
      fetchFn,
    });
  }
  return plan;
}

export async function runConfigureBranchProtectionCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchFn = globalThis.fetch,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const args = parseArguments(argv);
    if (args.help) {
      stdout.write([
        'Dry-run (default): configure-branch-protection.mjs [--phase bootstrap-lock|bootstrap-attested|steady-state]',
        `Apply: add --apply --confirm ${RELEASE_GUARDS_CONFIRMATION}`,
        'bootstrap-attested/steady-state require --release-app-id <id> and --release-app-slug <slug>.',
        'bootstrap-attested apply also requires --candidate-sha <40-hex>.',
        'steady-state apply also requires --candidate-sha <current-main-40-hex> and --ci-context <existing-context>.',
        '',
      ].join('\n'));
      return 0;
    }

    const repository = args.repository ?? env.GITHUB_REPOSITORY ?? RELEASE_GUARDS_REPOSITORY;
    const rawReleaseAppId = args.releaseAppId ?? env.RELEASE_GATE_APP_ID;
    const rawReleaseAppSlug = args.releaseAppSlug ?? env.RELEASE_GATE_APP_SLUG;
    const releaseAppId = args.phase === 'bootstrap-lock'
      ? undefined
      : validateReleaseAppId(rawReleaseAppId);
    const releaseAppSlug = args.phase === 'bootstrap-lock'
      ? undefined
      : validateReleaseAppSlug(rawReleaseAppSlug);
    if (!args.apply) {
      const plan = buildReleaseGuardPlan({
        phase: args.phase,
        repository,
        ciContext: args.ciContext,
        releaseAppId,
      });
      stdout.write(`DRY-RUN: no GitHub settings were changed.\n${JSON.stringify(plan, null, 2)}\n`);
      return 0;
    }

    const plan = await applyReleaseGuardPlan({
      phase: args.phase,
      repository,
      candidateSha: args.candidateSha,
      ciContext: args.ciContext,
      releaseAppId,
      releaseAppSlug,
      confirmation: args.confirmation,
      token: env.GITHUB_TOKEN,
      apiBaseUrl: args.apiBaseUrl ?? env.GITHUB_API_URL ?? 'https://api.github.com',
      fetchFn,
    });
    stdout.write(`Applied ${plan.phase} release guards to main and staging.\n`);
    return 0;
  } catch (error) {
    const message = error instanceof ReleaseGuardConfigurationError
      ? error.message
      : 'Release guard configuration failed closed.';
    stderr.write(`Release guards DENIED: ${message}\n`);
    return 1;
  }
}

const isDirectInvocation = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  process.exitCode = await runConfigureBranchProtectionCli();
}
