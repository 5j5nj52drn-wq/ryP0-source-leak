import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Host } from '@expo/ui';
import '../global.css';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit" options={{ presentation: 'formSheet' }} />
        <Stack.Screen name="add" options={{ presentation: 'formSheet' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
