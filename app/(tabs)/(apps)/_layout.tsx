import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function AppsStackLayout() {
  const colorScheme = useColorScheme();
  const stackThemeKey = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <Stack
      key={stackThemeKey}
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'ryP0' }} />
      <Stack.Screen
        name="[bundleIdentifier]"
        options={{ title: 'App Details', headerLargeTitle: false, headerLargeTitleEnabled: false }}
      />
    </Stack>
  );
}
