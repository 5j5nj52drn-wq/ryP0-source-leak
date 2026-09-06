import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import AppDetails from '../../../components/app-details';
import { useRepoStore } from '../../../store/useRepoStore';
import { useAppTheme } from '../../../theme/app-preferences';

export default function AppDetailsScreen() {
  const { bundleIdentifier } = useLocalSearchParams<{ bundleIdentifier: string }>();
  const repo = useRepoStore((state) => state.repo);
  const fetchRepo = useRepoStore((state) => state.fetchRepo);
  const isLoading = useRepoStore((state) => state.isLoading);
  const theme = useAppTheme();

  useEffect(() => {
    if (!repo) {
      void fetchRepo();
    }
  }, [fetchRepo, repo]);

  const app = repo?.apps.find((candidate) => candidate.bundleIdentifier === bundleIdentifier);

  if (app) {
    return <AppDetails app={app} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Stack.Screen options={{ title: 'App Details', headerLargeTitle: false }} />
      {isLoading || !repo ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Text style={[styles.title, { color: theme.label }]}>App not found</Text>
          <Text style={[styles.description, { color: theme.secondaryLabel }]}>This app is no longer available in the repository.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
  },
});
