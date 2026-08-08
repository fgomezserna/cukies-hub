#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_STATUS_CONTEXTS = Object.freeze([
  'release/staging-deployed',
  'release/staging-validated',
]);
export const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
export const STAGING_QA_CURRENT_RUN_CONTEXT = 'staging-push-qa';

const ATTESTATION_RUN_RULES = Object.freeze({
  'release/staging-deployed': Object.freeze({
    workflowPath: '.github/workflows/staging-deploy-verify.yml',
    event: 'push',
    headBranch: 'staging',
    displayTitle: (candidateSha) => `Staging deploy ${candidateSha}`,
    expectedHeadSha: ({ candidateSha }) => candidateSha,
  }),
  'release/staging-validated': Object.freeze({
    workflowPath: '.github/workflows/staging-deploy-verify.yml',
    event: 'push',
    headBranch: 'staging',
    displayTitle: (candidateSha) => `Staging deploy ${candidateSha}`,
    expectedHeadSha: ({ candidateSha }) => candidateSha,
  }),
});

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)$/;
const APP_BOT_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?\[bot\]$/;
const VALID_STATUS_STATES = new Set(['error', 'failure', 'pending', 'success']);
const MAX_COMPARE_COMMITS = 100;

export class AttestationVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AttestationVerificationError';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFullGitSha(value) {
  return typeof value === 'string' && FULL_GIT_SHA_PATTERN.test(value);
}

function assertCandidateSha(candidateSha) {
  if (!isFullGitSha(candidateSha)) {
    throw new AttestationVerificationError(
      'Candidate SHA debe ser un SHA Git completo en minúsculas de 40 caracteres.',
    );
  }
}

function parseActionsRunTarget(targetUrl, repository) {
  if (typeof targetUrl !== 'string') {
    throw new AttestationVerificationError(
      'El commit status requerido no enlaza un Actions run auditable.',
    );
  }
  const match = targetUrl.match(
    /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/actions\/runs\/([1-9][0-9]{0,15})$/,
  );
  if (!match || `${match[1]}/${match[2]}` !== repository) {
    throw new AttestationVerificationError(
      'El target_url del commit status no es un Actions run canónico del repositorio.',
    );
  }
  return match[3];
}

function validateStatusCreatorLogin(value) {
  if (
    typeof value !== 'string'
    || !APP_BOT_LOGIN_PATTERN.test(value)
    || value === 'github-actions[bot]'
  ) {
    throw new AttestationVerificationError(
      'RELEASE_STATUS_CREATOR_LOGIN debe identificar el bot de una GitHub App dedicada.',
    );
  }
  return value;
}

function validateStatusCreator(status, context, expectedCreatorLogin) {
  const creator = status.creator;
  if (
    !isRecord(creator)
    || creator.login !== expectedCreatorLogin
    || !Number.isSafeInteger(creator.id)
    || creator.id <= 0
    || creator.type !== 'Bot'
  ) {
    throw new AttestationVerificationError(
      `El contexto ${context} no fue emitido por la GitHub App de release dedicada.`,
    );
  }
}

export function validateActionsRunPayload(payload, {
  repository,
  candidateSha,
  mainSha,
  context,
  runId,
  targetUrl,
  allowCurrentRunInProgress = false,
} = {}) {
  assertCandidateSha(candidateSha);
  const rule = ATTESTATION_RUN_RULES[context];
  if (!rule || typeof repository !== 'string' || !/^\d+$/.test(runId ?? '')) {
    throw new AttestationVerificationError('La regla de procedencia del Actions run no es válida.');
  }
  const expectedHeadSha = rule.expectedHeadSha({ candidateSha, mainSha });
  if (!isFullGitSha(expectedHeadSha)) {
    throw new AttestationVerificationError(
      `No se puede anclar ${context} a un head SHA confiable.`,
    );
  }
  const hasTerminalSuccess = payload?.status === 'completed' && payload?.conclusion === 'success';
  const isExpectedCurrentRun = allowCurrentRunInProgress
    && payload?.status === 'in_progress'
    && payload?.conclusion === null;
  if (
    !isRecord(payload)
    || String(payload.id) !== runId
    || payload.html_url !== targetUrl
    || payload.path !== rule.workflowPath
    || payload.event !== rule.event
    || payload.head_branch !== rule.headBranch
    || payload.head_sha !== expectedHeadSha
    || payload.display_title !== rule.displayTitle(candidateSha)
    || (!hasTerminalSuccess && !isExpectedCurrentRun)
    || !isRecord(payload.repository)
    || payload.repository.full_name !== repository
    || !isRecord(payload.head_repository)
    || payload.head_repository.full_name !== repository
    || !Number.isSafeInteger(payload.workflow_id)
    || payload.workflow_id <= 0
  ) {
    throw new AttestationVerificationError(
      `El Actions run enlazado por ${context} no demuestra workflow, ref, SHA y conclusion esperados.`,
    );
  }
  return {
    context,
    runId,
    workflowPath: rule.workflowPath,
    event: rule.event,
    headBranch: rule.headBranch,
    headSha: expectedHeadSha,
  };
}

export function validateStagingEnvironmentPayload(payload) {
  const reviewerRule = Array.isArray(payload?.protection_rules)
    ? payload.protection_rules.find((rule) => rule?.type === 'required_reviewers')
    : undefined;
  const branchPolicy = payload?.deployment_branch_policy;
  if (
    !isRecord(payload)
    || payload.name !== 'Staging'
    || !isRecord(reviewerRule)
    || reviewerRule.prevent_self_review !== true
    || !Array.isArray(reviewerRule.reviewers)
    || reviewerRule.reviewers.length === 0
    || reviewerRule.reviewers.some(({ type, reviewer } = {}) =>
      !['User', 'Team'].includes(type)
      || !isRecord(reviewer)
      || !Number.isSafeInteger(reviewer.id)
      || reviewer.id <= 0)
    || branchPolicy?.protected_branches !== false
    || branchPolicy?.custom_branch_policies !== true
  ) {
    throw new AttestationVerificationError(
      'El entorno Staging debe exigir revisores, impedir autoaprobación y usar políticas custom.',
    );
  }
  return {
    name: 'Staging',
    preventSelfReview: true,
    reviewerIds: reviewerRule.reviewers.map(({ reviewer }) => reviewer.id),
    customBranchPolicies: true,
  };
}

export function validateDeploymentBranchPoliciesPayload(payload, expectedBranch, environmentName) {
  if (
    !isRecord(payload)
    || payload.total_count !== 1
    || !Array.isArray(payload.branch_policies)
    || payload.branch_policies.length !== 1
    || !isRecord(payload.branch_policies[0])
    || payload.branch_policies[0].name !== expectedBranch
    || payload.branch_policies[0].type !== 'branch'
  ) {
    throw new AttestationVerificationError(
      `El entorno ${environmentName} debe permitir exclusivamente la rama ${expectedBranch}.`,
    );
  }
  return { environmentName, branches: [expectedBranch] };
}

export function validateCommitStatusPayload(payload, candidateSha, {
  requiredContexts = REQUIRED_STATUS_CONTEXTS,
  requireCombinedSuccess = true,
} = {}) {
  assertCandidateSha(candidateSha);
  if (
    !Array.isArray(requiredContexts)
    || requiredContexts.length === 0
    || new Set(requiredContexts).size !== requiredContexts.length
    || requiredContexts.some((context) => !REQUIRED_STATUS_CONTEXTS.includes(context))
    || typeof requireCombinedSuccess !== 'boolean'
  ) {
    throw new AttestationVerificationError('La configuración de contextos requeridos no es válida.');
  }
  if (!isRecord(payload)) {
    throw new AttestationVerificationError('La respuesta de commit status no es un objeto JSON válido.');
  }
  if (!isFullGitSha(payload.sha) || payload.sha !== candidateSha) {
    throw new AttestationVerificationError(
      'El SHA del commit status combinado no coincide exactamente con el candidato.',
    );
  }
  if (requireCombinedSuccess && payload.state !== 'success') {
    throw new AttestationVerificationError('El estado combinado de commit statuses debe ser success.');
  }
  if (!requireCombinedSuccess && !VALID_STATUS_STATES.has(payload.state)) {
    throw new AttestationVerificationError('El estado combinado de commit statuses no es válido.');
  }
  if (!Array.isArray(payload.statuses)) {
    throw new AttestationVerificationError('La API no devolvió un array statuses válido.');
  }
  if (
    !Number.isSafeInteger(payload.total_count)
    || payload.total_count < 0
    || payload.total_count !== payload.statuses.length
    || payload.total_count > 100
  ) {
    throw new AttestationVerificationError('total_count de commit statuses no es válido.');
  }

  for (const status of payload.statuses) {
    if (
      !isRecord(status)
      || typeof status.context !== 'string'
      || status.context === ''
      || !VALID_STATUS_STATES.has(status.state)
    ) {
      throw new AttestationVerificationError('La API devolvió un commit status con forma inválida.');
    }
    if (
      Object.hasOwn(status, 'sha')
      && (!isFullGitSha(status.sha) || status.sha !== candidateSha)
    ) {
      throw new AttestationVerificationError(
        `El contexto ${status.context} declara un SHA distinto del candidato.`,
      );
    }
  }

  for (const context of requiredContexts) {
    const matches = payload.statuses.filter((status) => status.context === context);
    if (matches.length === 0) {
      throw new AttestationVerificationError(`Falta el contexto requerido ${context}.`);
    }
    if (matches.length > 1) {
      throw new AttestationVerificationError(`El contexto requerido ${context} está duplicado.`);
    }
    if (matches[0].state !== 'success') {
      throw new AttestationVerificationError(`El contexto ${context} debe estar en success.`);
    }
  }

  return {
    candidateSha,
    contexts: [...requiredContexts],
    matchedStatuses: requiredContexts.map((context) =>
      payload.statuses.find((status) => status.context === context)),
  };
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AttestationVerificationError(`${name} de compare no es un entero válido.`);
  }
}

export function validateAncestryPayload(payload, { mainSha, candidateSha } = {}) {
  assertCandidateSha(candidateSha);
  if (!isFullGitSha(mainSha)) {
    throw new AttestationVerificationError('El SHA resuelto de main no es un SHA Git completo.');
  }
  if (!isRecord(payload) || !['ahead', 'identical'].includes(payload.status)) {
    throw new AttestationVerificationError('main no consta como ancestro del candidato.');
  }

  assertNonNegativeInteger(payload.ahead_by, 'ahead_by');
  assertNonNegativeInteger(payload.behind_by, 'behind_by');
  assertNonNegativeInteger(payload.total_commits, 'total_commits');
  if (
    payload.behind_by !== 0
    || !isRecord(payload.base_commit)
    || payload.base_commit.sha !== mainSha
    || !isRecord(payload.merge_base_commit)
    || payload.merge_base_commit.sha !== mainSha
    || !Array.isArray(payload.commits)
    || payload.total_commits !== payload.ahead_by
    || payload.total_commits !== payload.commits.length
    || payload.total_commits > MAX_COMPARE_COMMITS
    || payload.commits.some((commit) => !isRecord(commit) || !isFullGitSha(commit.sha))
  ) {
    throw new AttestationVerificationError(
      'La relación main -> staging es inconsistente, diverge o excede el límite verificable.',
    );
  }

  if (payload.status === 'identical') {
    if (mainSha !== candidateSha || payload.ahead_by !== 0 || payload.commits.length !== 0) {
      throw new AttestationVerificationError('La relación identical de compare es inconsistente.');
    }
  } else if (
    mainSha === candidateSha
    || payload.ahead_by === 0
    || payload.commits.at(-1)?.sha !== candidateSha
  ) {
    throw new AttestationVerificationError(
      'La relación ahead no termina exactamente en el Candidate SHA.',
    );
  }

  return {
    mainSha,
    candidateSha,
    relation: payload.status,
    commitsAhead: payload.ahead_by,
  };
}

function validateRepository(repository) {
  if (typeof repository !== 'string') {
    throw new AttestationVerificationError('GITHUB_REPOSITORY no es válido.');
  }
  const match = repository.match(REPOSITORY_PATTERN);
  if (!match || match[1].includes('..') || match[2].includes('..')) {
    throw new AttestationVerificationError('GITHUB_REPOSITORY debe tener la forma owner/repo.');
  }
  return { owner: match[1], repo: match[2], fullName: repository };
}

function validateApiBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AttestationVerificationError('La URL base de GitHub API no es válida.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    throw new AttestationVerificationError('GitHub API debe usar una URL HTTPS sin credenciales.');
  }
  return parsed.href.replace(/\/+$/, '');
}

function contentTypeIsJson(response) {
  if (typeof response.headers?.get !== 'function') {
    return false;
  }
  const value = response.headers.get('content-type');
  if (typeof value !== 'string') {
    return false;
  }
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

async function fetchGitHubJson(url, { token, fetchFn }) {
  let response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new AttestationVerificationError('Error de red al consultar GitHub API.');
  }

  if (!isRecord(response) || response.status !== 200) {
    const status = isRecord(response) && Number.isInteger(response.status)
      ? `HTTP ${response.status}`
      : 'respuesta HTTP inválida';
    throw new AttestationVerificationError(`GitHub API devolvió ${status}.`);
  }
  if (!contentTypeIsJson(response)) {
    throw new AttestationVerificationError('GitHub API no devolvió content-type JSON.');
  }

  try {
    return await response.json();
  } catch {
    throw new AttestationVerificationError('GitHub API devolvió JSON inválido.');
  }
}

async function verifyRunProvenance({
  apiUrl,
  repoPath,
  repository,
  candidateSha,
  mainSha,
  statuses,
  token,
  fetchFn,
  currentRunId,
  allowCurrentRunInProgress = false,
  statusCreatorLogin,
}) {
  const runs = [];
  const payloadsByRunId = new Map();
  for (const status of statuses) {
    validateStatusCreator(status, status.context, statusCreatorLogin);
    const runId = parseActionsRunTarget(status.target_url, repository);
    if (currentRunId !== undefined && runId !== currentRunId) {
      throw new AttestationVerificationError(
        'El status deployed no procede de la ejecución QA actual de staging.',
      );
    }
    const targetUrl = `https://github.com/${repository}/actions/runs/${runId}`;
    let payload = payloadsByRunId.get(runId);
    if (!payload) {
      payload = await fetchGitHubJson(
        `${apiUrl}${repoPath}/actions/runs/${runId}`,
        { token, fetchFn },
      );
      payloadsByRunId.set(runId, payload);
    }
    const mayUseInProgressRun = allowCurrentRunInProgress && runId === currentRunId;
    runs.push(validateActionsRunPayload(payload, {
      repository,
      candidateSha,
      mainSha,
      context: status.context,
      runId,
      targetUrl,
      allowCurrentRunInProgress: mayUseInProgressRun,
    }));
  }
  if (statuses.length > 1 && new Set(runs.map(({ runId }) => runId)).size !== 1) {
    throw new AttestationVerificationError(
      'Los dos contextos de staging deben proceder de una única ejecución protegida.',
    );
  }
  return runs;
}

export async function verifyAttestations({
  repository,
  candidateSha,
  token,
  apiBaseUrl = DEFAULT_GITHUB_API_URL,
  fetchFn = globalThis.fetch,
  deployedOnly = false,
  currentRunId,
  statusCreatorLogin,
} = {}) {
  const parsedRepository = validateRepository(repository);
  assertCandidateSha(candidateSha);
  if (typeof token !== 'string' || token.trim() === '' || /[\r\n]/.test(token)) {
    throw new AttestationVerificationError('GITHUB_TOKEN es obligatorio y debe tener una forma válida.');
  }
  if (typeof fetchFn !== 'function') {
    throw new AttestationVerificationError('La dependencia fetch no es válida.');
  }
  const validatedStatusCreatorLogin = validateStatusCreatorLogin(statusCreatorLogin);
  if (typeof deployedOnly !== 'boolean') {
    throw new AttestationVerificationError('deployedOnly debe ser booleano.');
  }
  if (
    deployedOnly
    && (typeof currentRunId !== 'string' || !/^[1-9][0-9]{0,15}$/.test(currentRunId))
  ) {
    throw new AttestationVerificationError(
      'La validación QA interna exige el GITHUB_RUN_ID exacto de la ejecución actual.',
    );
  }
  const apiUrl = validateApiBaseUrl(apiBaseUrl);
  const repoPath = `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}`;
  const environmentPayload = await fetchGitHubJson(
    `${apiUrl}${repoPath}/environments/Staging`,
    { token, fetchFn },
  );
  const environment = validateStagingEnvironmentPayload(environmentPayload);
  const branchPoliciesPayload = await fetchGitHubJson(
    `${apiUrl}${repoPath}/environments/Staging/deployment-branch-policies?per_page=100`,
    { token, fetchFn },
  );
  environment.branches = validateDeploymentBranchPoliciesPayload(
    branchPoliciesPayload,
    'staging',
    'Staging',
  ).branches;

  if (deployedOnly) {
    const statusPayload = await fetchGitHubJson(
      `${apiUrl}${repoPath}/commits/${candidateSha}/status?per_page=100`,
      { token, fetchFn },
    );
    const statuses = validateCommitStatusPayload(statusPayload, candidateSha, {
      requiredContexts: ['release/staging-deployed'],
      requireCombinedSuccess: false,
    });
    const runs = await verifyRunProvenance({
      apiUrl,
      repoPath,
      repository: parsedRepository.fullName,
      candidateSha,
      statuses: statuses.matchedStatuses,
      token,
      fetchFn,
      currentRunId,
      allowCurrentRunInProgress: true,
      statusCreatorLogin: validatedStatusCreatorLogin,
    });
    return {
      repository: parsedRepository.fullName,
      candidateSha,
      contexts: statuses.contexts,
      runs,
      environment,
      mode: 'deployed-only',
    };
  }

  const mainPayload = await fetchGitHubJson(
    `${apiUrl}${repoPath}/commits/main`,
    { token, fetchFn },
  );
  if (!isRecord(mainPayload) || !isFullGitSha(mainPayload.sha)) {
    throw new AttestationVerificationError('GitHub API no pudo resolver main a un SHA completo.');
  }
  const mainSha = mainPayload.sha;

  const statusPayload = await fetchGitHubJson(
    `${apiUrl}${repoPath}/commits/${candidateSha}/status?per_page=100`,
    { token, fetchFn },
  );
  const statuses = validateCommitStatusPayload(statusPayload, candidateSha);

  const runs = await verifyRunProvenance({
    apiUrl,
    repoPath,
    repository: parsedRepository.fullName,
    candidateSha,
    mainSha,
    statuses: statuses.matchedStatuses,
    token,
    fetchFn,
    statusCreatorLogin: validatedStatusCreatorLogin,
  });

  const ancestryPayload = await fetchGitHubJson(
    `${apiUrl}${repoPath}/compare/${mainSha}...${candidateSha}?per_page=${MAX_COMPARE_COMMITS}`,
    { token, fetchFn },
  );
  const ancestry = validateAncestryPayload(ancestryPayload, { mainSha, candidateSha });

  return {
    repository: parsedRepository.fullName,
    candidateSha,
    mainSha,
    contexts: statuses.contexts,
    runs,
    environment,
    relation: ancestry.relation,
  };
}

export function verifyDeployedAttestation(options = {}) {
  return verifyAttestations({ ...options, deployedOnly: true });
}

function parseCliArguments(argv) {
  const values = {};
  const names = new Map([
    ['--sha', 'candidateSha'],
    ['--repository', 'repository'],
    ['--api-url', 'apiBaseUrl'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      values.help = true;
      continue;
    }
    if (argument === '--staging-push-qa-current-run') {
      if (values.stagingPushQaCurrentRun) {
        throw new AttestationVerificationError(
          '--staging-push-qa-current-run no puede repetirse.',
        );
      }
      values.stagingPushQaCurrentRun = true;
      continue;
    }
    const property = names.get(argument);
    if (!property) {
      throw new AttestationVerificationError(`Argumento no reconocido: ${argument}.`);
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new AttestationVerificationError(`Falta el valor de ${argument}.`);
    }
    values[property] = value;
    index += 1;
  }
  return values;
}

export async function runVerifyAttestationsCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchFn = globalThis.fetch,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const args = parseCliArguments(argv);
    if (args.help) {
      stdout.write(
        'Uso: verify-attestations.mjs --sha <40-hex> --repository <owner/repo> [--staging-push-qa-current-run]\n',
      );
      return 0;
    }
    if (
      args.stagingPushQaCurrentRun
      && env.RELEASE_ATTESTATION_CONTEXT !== STAGING_QA_CURRENT_RUN_CONTEXT
    ) {
      throw new AttestationVerificationError(
        `RELEASE_ATTESTATION_CONTEXT debe ser exactamente ${STAGING_QA_CURRENT_RUN_CONTEXT} para usar --staging-push-qa-current-run.`,
      );
    }

    const repository = args.repository ?? env.GITHUB_REPOSITORY;
    const candidateSha = args.candidateSha
      ?? env.RELEASE_CANDIDATE_SHA
      ?? env.CANDIDATE_SHA
      ?? env.GITHUB_HEAD_SHA;
    if (args.stagingPushQaCurrentRun) {
      const expectedWorkflowRef = `${repository}/.github/workflows/staging-deploy-verify.yml@refs/heads/staging`;
      if (
        env.GITHUB_REF !== 'refs/heads/staging'
        || env.GITHUB_SHA !== candidateSha
        || env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef
      ) {
        throw new AttestationVerificationError(
          'La validación QA interna solo puede ejecutarse desde el workflow protegido de staging.',
        );
      }
    }

    const result = await verifyAttestations({
      repository,
      candidateSha,
      token: env.GITHUB_TOKEN,
      apiBaseUrl: args.apiBaseUrl ?? env.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
      fetchFn,
      deployedOnly: args.stagingPushQaCurrentRun === true,
      currentRunId: args.stagingPushQaCurrentRun ? env.GITHUB_RUN_ID : undefined,
      statusCreatorLogin: env.RELEASE_STATUS_CREATOR_LOGIN,
    });

    if (result.mode === 'deployed-only') {
      stdout.write(
        `Attestation release/staging-deployed validada para ${result.candidateSha}.\n`,
      );
    } else {
      stdout.write(
        `Attestations validadas para ${result.candidateSha}; main es ancestro (${result.relation}).\n`,
      );
    }
    return 0;
  } catch (error) {
    const message = error instanceof AttestationVerificationError
      ? error.message
      : 'Error interno durante la verificación.';
    stderr.write(`Attestations DENEGADAS: ${message}\n`);
    return 1;
  }
}

const isDirectInvocation = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectInvocation) {
  process.exitCode = await runVerifyAttestationsCli();
}
