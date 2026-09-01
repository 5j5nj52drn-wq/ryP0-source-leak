import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function SearchLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: Platform.OS === 'ios',
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerBlurEffect: 'regular',
      }}
    />
  );
}
