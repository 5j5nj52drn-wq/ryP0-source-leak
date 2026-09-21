import type { RepoApp } from '../types/repo';
import { getSafeGitHubRepositoryUrl } from './safe-url';

// The public catalog and its former release host are delivery infrastructure,
// not the developer's project.  Do not turn an IPA URL hosted there into a
// misleading "View on GitHub" destination on an app's detail page.
const CATALOG_DELIVERY_REPOSITORIES = new Set([
  'https://github.com/Sami-Wali/ryP0-repository',
  'https://github.com/Sami-Wali/ryP0',
]);

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
    if (projectUrl && !CATALOG_DELIVERY_REPOSITORIES.has(projectUrl)) {
      return projectUrl;
    }
  }

  return null;
}
