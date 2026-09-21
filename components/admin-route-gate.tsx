import React, { type ReactNode, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Button, FieldGroup, Host, ListItem, Text } from '@expo/ui';

import { isAdminBuild } from '../services/build-variant';
import { useRepoStore } from '../store/useRepoStore';

interface AdminRouteGateProps {
  title: string;
  children: ReactNode;
}

/**
 * Keeps administrative routes out of the public binary's UI, including direct
 * links. It is intentionally paired with server-side authorization; a route
 * guard is not treated as a security boundary by itself.
 */
export function AdminRouteGate({ title, children }: AdminRouteGateProps) {
  const router = useRouter();
  const isInitialized = useRepoStore((state) => state.isInitialized);
  const isDeveloperMode = useRepoStore((state) => state.isDeveloperMode);
  const initializeStore = useRepoStore((state) => state.initializeStore);

  useEffect(() => {
    void initializeStore();
  }, [initializeStore]);

  if (isAdminBuild && isInitialized && isDeveloperMode) return <>{children}</>;

  const isPublic = !isAdminBuild;
  const isChecking = isAdminBuild && !isInitialized;
  const sectionTitle = isChecking
    ? 'Checking Developer Access'
    : isPublic
      ? 'Read-Only Public Build'
      : 'Developer Access Required';
  const titleText = isChecking
    ? 'Checking Access'
    : isPublic
      ? 'Admin Tools Are Not Available'
      : 'Developer Mode Is Locked';
  const supportingText = isChecking
    ? 'Restoring this device’s protected Developer Mode access.'
    : isPublic
      ? 'This consumer build cannot store or use administrator credentials. Use ryP0 Admin to manage the catalog.'
      : 'Unlock the verified Sami-Wali account in Settings before using catalog management tools.';

  return (
    <Host style={{ flex: 1, width: '100%' }}>
      <Stack.Screen options={{ title, headerLargeTitle: false }} />
      <FieldGroup>
        <FieldGroup.Section title={sectionTitle}>
          <ListItem supportingText={supportingText}>
            <Text>{titleText}</Text>
          </ListItem>
          {!isChecking ? (
            <Button
              onPress={() => router.replace(isPublic ? '/(tabs)/(apps)' : '/(tabs)/(settings)')}
            >
              <Text>{isPublic ? 'Return to Apps' : 'Open Settings'}</Text>
            </Button>
          ) : null}
        </FieldGroup.Section>
      </FieldGroup>
    </Host>
  );
}
