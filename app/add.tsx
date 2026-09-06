import { Redirect } from 'expo-router';

/**
 * Compatibility route for old deep links. The role-aware Add App workspace
 * lives in the native tab, so both developers and consumers always arrive at
 * the same protected flow.
 */
export default function LegacyAddRoute() {
  return <Redirect href="/(tabs)/(add)" />;
}
