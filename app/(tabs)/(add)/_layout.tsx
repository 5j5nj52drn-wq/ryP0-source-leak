import { Stack } from 'expo-router';

export default function AddStackLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleShadowVisible: false, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Add App', headerLargeTitle: true }} />
    </Stack>
  );
}
