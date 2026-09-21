import Constants from 'expo-constants';

/**
 * A build label is intentionally public metadata. It selects UI and local
 * credential behaviour, but it is never an authorization decision: protected
 * GitHub and control-API operations still validate the authenticated owner.
 */
export type RyP0BuildVariant = 'admin' | 'public';

function getConfiguredVariant(): RyP0BuildVariant {
  const configured = Constants.expoConfig?.extra?.ryP0BuildVariant;
  return configured === 'public' ? 'public' : 'admin';
}

export const ryp0BuildVariant = getConfiguredVariant();
export const isAdminBuild = ryp0BuildVariant === 'admin';
export const isPublicBuild = !isAdminBuild;

export function assertAdminBuild(): void {
  if (!isAdminBuild) {
    throw new Error('This is the read-only ryP0 public build. Use ryP0 Admin for developer tools.');
  }
}
