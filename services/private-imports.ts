import { dispatchGitHubWorkflow, listGitHubWorkflows } from './github-workflows';
import { getSafeExternalHttpsUrl } from './safe-url';

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
  /** Exact Source.JSON/repo.json app selector; never a fuzzy display-name match. */
  selector?: string;
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
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9._-]{1,100}$/.test(part))) {
      throw new PrivateImportError('Use a GitHub repository as owner/repository.');
    }
    return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, '')}`;
  }
  const parts = input.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9._-]{1,100}$/.test(part))) {
    throw new PrivateImportError('Use a GitHub repository as owner/repository.');
  }
  return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, '')}`;
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

  if (!category) throw new PrivateImportError('Choose a category.');
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
  if (method === 'telegram-r2' && input.archiveToR2) inputs.archive_to_r2 = 'true';

  await dispatchGitHubWorkflow(workflow.id, inputs);
  return workflow.htmlUrl ? { workflowUrl: workflow.htmlUrl } : {};
}
