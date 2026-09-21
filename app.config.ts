import type { ConfigContext, ExpoConfig } from 'expo/config';

const baseConfig = require('./app.json').expo as ExpoConfig;

type RyP0BuildVariant = 'admin' | 'public';

function readBuildVariant(): RyP0BuildVariant {
  const configured = process.env.RYP0_APP_VARIANT?.trim().toLowerCase();

  if (!configured || configured === 'admin') return 'admin';
  if (configured === 'public') return 'public';

  throw new Error('RYP0_APP_VARIANT must be either "admin" or "public".');
}

/**
 * One source tree intentionally produces two binaries. The label below is
 * public build metadata only; no credential is read here or placed in `extra`.
 *
 * `admin` is the default to retain the current local development behaviour.
 * Set `RYP0_APP_VARIANT=public` explicitly for the consumer binary.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = readBuildVariant();
  const isAdmin = variant === 'admin';
  const displayName = isAdmin ? 'ryP0 Admin' : 'ryP0';

  return {
    ...config,
    ...baseConfig,
    name: displayName,
    slug: isAdmin ? 'ryp0-admin' : 'ryP0',
    scheme: isAdmin ? 'ryp0-admin' : 'ryp0',
    ios: {
      ...baseConfig.ios,
      // The public build is deliberately a different app. It therefore cannot
      // read the Admin app's Keychain item even on the same phone.
      bundleIdentifier: isAdmin ? 'com.ry0.ryP0.admin' : 'com.ry0.ryP0',
      infoPlist: {
        ...baseConfig.ios?.infoPlist,
        RyP0BuildVariant: variant,
      },
    },
    android: {
      ...baseConfig.android,
      package: isAdmin ? 'com.ry0.ryp0.admin' : 'com.ry0.ryp0',
    },
    extra: {
      ...baseConfig.extra,
      // This is only a UI/credential-storage guard. The backend remains the
      // authority for every write and workflow operation.
      ryP0BuildVariant: variant,
    },
  };
};
