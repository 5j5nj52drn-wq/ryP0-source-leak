import type { RepoApp } from '../types/repo';
import { getSafeGitHubRepositoryUrl } from './safe-url';

const CATALOG_DELIVERY_REPOSITORY = 'https://github.com/Sami-Wali/ryP0-repository';

/**
 * Finds the upstream GitHub project for an app without exposing the private
 * automation repository or mistaking ryP0's mirrored IPA release for the
 * upstream project.
 */
export function getAppGitHubProjectUrl(app: Pick<RepoApp, 'githubURL' | 'automation' | 'importSource' | 'versions'>): string | null {
  const candidates = [
    app.githubURL,
    app.automation?.sourceURL,
    app.importSource?.sourceURL,
    app.versions[0]?.downloadURL,
  ];

  for (const candidate of candidates) {
    const projectUrl = getSafeGitHubRepositoryUrl(candidate);
    if (projectUrl && projectUrl !== CATALOG_DELIVERY_REPOSITORY) {
      return projectUrl;
    }
  }

  return null;
}
