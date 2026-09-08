import React from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import EditAppForm from '../components/edit-app-form';
import { useRepoStore } from '../store/useRepoStore';
import type { EditableAppFields } from '../types/edit-app-form';

export default function EditAppScreen() {
  const { bundleIdentifier, section } = useLocalSearchParams<{
    bundleIdentifier: string;
    section?: 'card' | 'page' | 'versions';
  }>();
  const router = useRouter();
  const repo = useRepoStore((state) => state.repo);
  const updateApp = useRepoStore((state) => state.updateApp);
  const commitChanges = useRepoStore((state) => state.commitChanges);

  const appIndex = repo?.apps.findIndex(a => a.bundleIdentifier === bundleIdentifier) ?? -1;
  const originalApp = appIndex >= 0 ? repo!.apps[appIndex] : null;

  if (!originalApp) {
    return (
      <View style={styles.notFoundContainer}>
        <Text style={styles.notFoundText}>App not found.</Text>
      </View>
    );
  }

  return (
    <EditAppForm
      app={originalApp}
      appIndex={appIndex}
      initialSection={section === 'page' || section === 'versions' ? section : 'card'}
      onCancel={() => router.back()}
      onSave={async (fields: EditableAppFields) => {
        updateApp(appIndex, { ...originalApp, ...fields });
        try {
          // The GitHub content API update is deliberately awaited. Closing the sheet
          // now means the edit is both visible locally and committed to repo.json.
          await commitChanges();
          router.back();
        } catch (error: any) {
          Alert.alert(
            'Could Not Save to GitHub',
            error?.message || 'The edit is still only on this device. Check Developer Mode and try again.',
          );
          throw error;
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  notFoundText: {
    color: '#8E8E93',
    fontSize: 16,
  },
});
