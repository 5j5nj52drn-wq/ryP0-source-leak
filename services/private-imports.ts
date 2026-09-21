import { dispatchGitHubWorkflow, listGitHubWorkflows } from './github-workflows';
import { getSafeExternalHttpsUrl } from './safe-url';
import {
  GITHUB_RELEASE_CHANNELS,
  isGitHubReleaseChannel,
  type GitHubReleaseChannel,
} from '../types/github-release-channel';
import {
  isImportDeliveryMode,
  isImportHistoryLimit,
  type ImportDeliveryMode,
  type ImportHistoryLimit,
} from '../types/import-options';
import type { AppUpdatePolicy } from '../types/repo';

/** The only manual-admin importer in the private automation repository. */
const IMPORT_WORKFLOW_PATH = '.github/workflows/import-app.yml';

export const PRIVATE_IMPORT_METHODS = [
  'direct-url',
  'upload-artifact',
  'repository',
  'github',
  'telegram-r2',
] as const;

export type PrivateImportMethod = (typeof PRIVATE_IMPORT_METHODS)[number];

export interface PrivateImportInput {
  method: PrivateImportMethod;
  sourceUrl?: string;
  appName?: string;
  description?: string;
  category: string;
  developerName?: string;
  iconUrl?: string;
  /** Optional exact IPA bundle ID assertion; the IPA still remains authoritative. */
  expectedBundleIdentifier?: string;
  /** A private staging release asset or a trusted successful Actions artifact. */
  uploadRepository?: string;
  uploadReleaseTag?: string;
  uploadRunId?: string;
  uploadArtifactName?: string;
  /** Exact repo.json app selector; never a fuzzy display-name match. */
  selector?: string;
  /** The exact GitHub source channel to inspect for a GitHub import. */
  githubReleaseChannel?: GitHubReleaseChannel;
  /**
   * Exact release tag. Required for the manual `tag` source; an optional
   * picker selection supplies it for the initial import of a moving channel.
   */
  githubReleaseTag?: string;
  /**
   * Optional IPA asset selector from a GitHub Release. With a moving Daily
   * channel it selects the matching asset name; with `tag` it pins that exact
   * release asset.
   */
  githubReleaseAssetName?: string;
  /** Optional SHA/prefix that scopes a GitHub Actions import to one commit. */
  githubActionsCommit?: string;
  /** Default is the original source URL; a mirror requires an explicit choice. */
  deliveryMode?: ImportDeliveryMode;
  /** Daily imports track only their current version; static imports are manual. */
  updatePolicy?: AppUpdatePolicy;
  /** Only applies to static imports. Daily imports must keep a single latest version. */
  historyLimit?: ImportHistoryLimit;
  /** @deprecated Telegram imports always archive to R2. */
  archiveToR2?: boolean;
}

export class PrivateImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateImportError';
  }
}

function clean(value: string | undefined, maximum: number) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : '';
}

function validatedUrl(value: string, label: string) {
  const safe = getSafeExternalHttpsUrl(value);
  if (!safe) throw new PrivateImportError(`${label} must be a secure HTTPS URL.`);
  return safe;
}

function githubRepositoryUrl(value: string) {
  const input = clean(value, 2_000);
  if (!input) throw new PrivateImportError('Enter a GitHub repository.');
  if (/^https?:\/\//i.test(input)) {
    const safe = validatedUrl(input, 'GitHub repository');
    const url = new URL(safe);
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
      throw new PrivateImportError('Use a github.com repository URL.');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const owner = parts[0] || '';
    const repository = (parts[1] || '').replace(/\.git$/i, '');
    if (parts.length !== 2 || !/^[A-Za-z0-9._-]{1,100}$/.test(owner) || !repository || !/^[A-Za-z0-9._-]{1,100}$/.test(repository)) {
      throw new PrivateImportError('Use a GitHub repository as owner/repository.');
    }
    return `https://github.com/${owner}/${repository}`;
  }
  const parts = input.replace(/^\/+|\/+$/g, '').split('/');
  const owner = parts[0] || '';
  const repository = (parts[1] || '').replace(/\.git$/i, '');
  if (parts.length !== 2 || !/^[A-Za-z0-9._-]{1,100}$/.test(owner) || !repository || !/^[A-Za-z0-9._-]{1,100}$/.test(repository)) {
    throw new PrivateImportError('Use a GitHub repository as owner/repository.');
  }
  return `https://github.com/${owner}/${repository}`;
}

function normalizeGitHubReleaseAssetName(value: string | undefined) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const name = value.trim().slice(0, 512);
  if (!/\.ipa$/i.test(name) || /[\\/\u0000-\u001F\u007F]/.test(name)) {
    throw new PrivateImportError('The selected GitHub release IPA asset is invalid. Choose it again from the release list.');
  }
  return name;
}

function defaultDeliveryMode(method: PrivateImportMethod): ImportDeliveryMode {
  if (method === 'telegram-r2') return 'r2';
  if (method === 'upload-artifact') return 'mirror-release';
  return 'direct-source';
}

function defaultUpdatePolicy(method: PrivateImportMethod): AppUpdatePolicy {
  return method === 'github' || method === 'repository' || method === 'telegram-r2'
    ? 'daily'
    : 'static';
}

/**
 * Starts the fixed private importer with bounded values. The phone needs only
 * the administrator's device-protected GitHub credential to dispatch it; the
 * workflow itself mints a separate GitHub App token for all public writes.
 */
export async function queuePrivateImport(input: PrivateImportInput): Promise<{ workflowUrl?: string }> {
  const method = input.method;
  if (!PRIVATE_IMPORT_METHODS.includes(method)) {
    throw new PrivateImportError('Choose a supported private import method.');
  }

  const sourceUrl = method === 'upload-artifact'
    ? ''
    : method === 'github'
      ? githubRepositoryUrl(input.sourceUrl || '')
      : validatedUrl(clean(input.sourceUrl, 4_096), 'Source URL');
  const appName = clean(input.appName, 160);
  const description = clean(input.description, 4_000);
  const category = clean(input.category, 80);
  const developerName = clean(input.developerName, 160);
  const selector = clean(input.selector, 255);
  const iconUrl = clean(input.iconUrl, 4_096);
  const expectedBundleIdentifier = clean(input.expectedBundleIdentifier, 255);
  const uploadRepository = clean(input.uploadRepository, 256);
  const uploadReleaseTag = clean(input.uploadReleaseTag, 120);
  const uploadRunId = clean(input.uploadRunId, 20);
  const uploadArtifactName = clean(input.uploadArtifactName, 160);
  const githubReleaseChannel = clean(input.githubReleaseChannel, 24).toLowerCase() || 'release';
  const githubReleaseTag = clean(input.githubReleaseTag, 128);
  const githubReleaseAssetName = normalizeGitHubReleaseAssetName(input.githubReleaseAssetName);
  const githubActionsCommit = clean(input.githubActionsCommit, 40).toLowerCase();
  const deliveryMode = input.deliveryMode ?? defaultDeliveryMode(method);
  const updatePolicy = input.updatePolicy ?? defaultUpdatePolicy(method);
  const historyLimit = input.historyLimit ?? (updatePolicy === 'daily' ? 1 : 3);

  if (!category) throw new PrivateImportError('Choose a category.');
  if (!isImportDeliveryMode(deliveryMode)) {
    throw new PrivateImportError('Choose where this IPA should be delivered from.');
  }
  if (updatePolicy !== 'daily' && updatePolicy !== 'static') {
    throw new PrivateImportError('Choose a valid update policy.');
  }
  if (!isImportHistoryLimit(historyLimit)) {
    throw new PrivateImportError('Choose how many static versions to keep.');
  }
  if (updatePolicy === 'daily' && historyLimit !== 1) {
    throw new PrivateImportError('Daily imports keep one current version. Choose Static / manual to keep version history.');
  }
  if (method === 'telegram-r2' && deliveryMode !== 'r2') {
    throw new PrivateImportError('Telegram imports are always stored in protected R2 storage.');
  }
  if (method === 'upload-artifact' && deliveryMode !== 'mirror-release') {
    throw new PrivateImportError('A local IPA needs a mirror copy because it has no permanent upstream link.');
  }
  if ((method === 'direct-url' || method === 'telegram-r2') && !appName) {
    throw new PrivateImportError('Enter an app name for this import.');
  }
  if (iconUrl) validatedUrl(iconUrl, 'Icon URL');
  if (expectedBundleIdentifier && !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(expectedBundleIdentifier)) {
    throw new PrivateImportError('Bundle Identifier must use dot-separated letters, numbers, and hyphens.');
  }
  if (method === 'upload-artifact') {
    if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(uploadRepository)) {
      throw new PrivateImportError('The private IPA staging repository is invalid.');
    }
    if (!uploadArtifactName) {
      throw new PrivateImportError('The private IPA staging asset is missing. Upload the IPA again.');
    }
    const releaseSource = Boolean(uploadReleaseTag);
    const actionSource = Boolean(uploadRunId);
    if (releaseSource === actionSource) {
      throw new PrivateImportError('Choose exactly one private staging release or trusted Actions artifact.');
    }
    if (uploadReleaseTag && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(uploadReleaseTag)) {
      throw new PrivateImportError('The private IPA staging release is invalid.');
    }
    if (uploadRunId && !/^[1-9][0-9]{0,18}$/.test(uploadRunId)) {
      throw new PrivateImportError('The trusted Actions run identifier is invalid.');
    }
  }
  if (method === 'github') {
    if (!isGitHubReleaseChannel(githubReleaseChannel)) {
      throw new PrivateImportError(`Choose a GitHub source: ${GITHUB_RELEASE_CHANNELS.join(', ')}.`);
    }
    if (githubReleaseChannel === 'tag' && !githubReleaseTag) {
      throw new PrivateImportError('Enter the exact GitHub release tag to import.');
    }
    if (githubReleaseChannel === 'actions' && githubReleaseTag) {
      throw new PrivateImportError('A GitHub release tag cannot be used with Latest Actions Build.');
    }
    if (githubReleaseTag && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(githubReleaseTag)) {
      throw new PrivateImportError('The GitHub release tag contains unsupported characters.');
    }
    if (githubReleaseChannel === 'actions' && githubReleaseAssetName) {
      throw new PrivateImportError('An IPA asset name can only be chosen from a GitHub Release, not an Actions build.');
    }
    if (githubReleaseChannel !== 'actions' && githubActionsCommit) {
      throw new PrivateImportError('An Actions commit can only be used with Latest Actions Build.');
    }
    if (githubActionsCommit && !/^[0-9a-f]{7,40}$/.test(githubActionsCommit)) {
      throw new PrivateImportError('Enter a Git commit SHA (at least 7 hexadecimal characters).');
    }
    if (githubReleaseChannel === 'actions' && deliveryMode !== 'mirror-release') {
      throw new PrivateImportError('GitHub Actions artifacts expire, so this source needs a mirror copy.');
    }
    if (githubReleaseChannel === 'tag' && updatePolicy !== 'static') {
      throw new PrivateImportError('A raw Git tag is a static import. Choose a release channel for daily updates.');
    }
  }

  const workflows = await listGitHubWorkflows();
  const workflow = workflows.find((candidate) => candidate.path === IMPORT_WORKFLOW_PATH);
  if (!workflow) {
    throw new PrivateImportError('The private Import ryP0 App workflow is not available yet. Publish the automation rebuild, then try again.');
  }
  if (workflow.state !== 'active') {
    throw new PrivateImportError('The private Import ryP0 App workflow is disabled. Enable it in Manage Apps first.');
  }

  const inputs: Record<string, string> = {
    method,
    category,
    delivery_mode: deliveryMode,
    update_policy: updatePolicy,
    history_limit: String(historyLimit),
  };
  if (sourceUrl) inputs.source_url = sourceUrl;
  if (appName) inputs.app_name = appName;
  if (description) inputs.description = description;
  if (developerName) inputs.developer_name = developerName;
  if (iconUrl) inputs.icon_url = iconUrl;
  if (expectedBundleIdentifier) inputs.expected_bundle_identifier = expectedBundleIdentifier;
  if (uploadRepository) inputs.upload_repository = uploadRepository;
  if (uploadReleaseTag) inputs.upload_release_tag = uploadReleaseTag;
  if (uploadRunId) inputs.upload_run_id = uploadRunId;
  if (uploadArtifactName) inputs.upload_artifact_name = uploadArtifactName;
  if (selector) inputs.selector = selector;
  if (method === 'github') {
    inputs.github_release_channel = githubReleaseChannel;
    if (githubReleaseTag) inputs.github_release_tag = githubReleaseTag;
    if (githubReleaseAssetName) inputs.github_release_asset_name = githubReleaseAssetName;
    if (githubActionsCommit) inputs.github_actions_commit = githubActionsCommit;
  }
  if (method === 'telegram-r2') inputs.archive_to_r2 = 'true';

  await dispatchGitHubWorkflow(workflow.id, inputs);
  return workflow.htmlUrl ? { workflowUrl: workflow.htmlUrl } : {};
}
