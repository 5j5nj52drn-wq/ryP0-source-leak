import { Redirect } from 'expo-router';

/**
 * The app always opens on the catalog. Keeping this explicit avoids Expo Router
 * picking the first route group alphabetically on a cold launch.
 */
export default function IndexRoute() {
  return <Redirect href="/(tabs)/(apps)" />;
}
