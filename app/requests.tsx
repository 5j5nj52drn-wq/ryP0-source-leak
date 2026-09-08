import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { Host, FieldGroup, ListItem, Text, Button } from '@expo/ui';
import { scrollDisabled } from '@expo/ui/swift-ui/modifiers';
import { fetchAppRequests } from '../services/app-requests';
import type { AppRequestRecord } from '../types/app-request';
import { useRepoStore } from '../store/useRepoStore';
import { getSafeExternalHttpsUrl } from '../services/safe-url';

function methodLabel(method: AppRequestRecord['method']) {
  if (method === 'direct-ipa') return 'Direct IPA';
  if (method === 'message-link') return 'Message link';
  return 'Updatable source';
}

export default function AppRequestsScreen() {
  const [requests, setRequests] = useState<AppRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isDeveloperMode = useRepoStore((state) => state.isDeveloperMode);
  const { height: viewportHeight, fontScale } = useWindowDimensions();
  const contentHeight = Math.max(viewportHeight + 180, (requests.length * 96 + 410) * Math.max(1, fontScale));

  const loadRequests = useCallback(async (showError = false) => {
    if (!isDeveloperMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRequests(await fetchAppRequests());
      setLoadError(null);
    } catch (error: any) {
      const message = error?.message || 'Try again when connected.';
      setLoadError(message);
      if (showError) Alert.alert('Could Not Load Requests', error?.message || 'Try again when connected.');
    } finally {
      setLoading(false);
    }
  }, [isDeveloperMode]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const openSource = async (request: AppRequestRecord) => {
    try {
      const sourceUrl = getSafeExternalHttpsUrl(request.sourceUrl)
        ?? getSafeExternalHttpsUrl(request.issueUrl);
      if (!sourceUrl) throw new Error('unsafe URL');
      await Linking.openURL(sourceUrl);
    } catch {
      Alert.alert('Could Not Open Request', 'This request has no usable source link.');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'App Requests', headerLargeTitle: true }} />
      {!isDeveloperMode ? (
        <Host style={{ flex: 1 }}>
          <FieldGroup>
            <FieldGroup.Section title="Developer Access Required">
              <ListItem supportingText="Sign in with a verified GitHub token in Settings to review incoming app requests.">
                <Text>Request Inbox Is Locked</Text>
              </ListItem>
            </FieldGroup.Section>
          </FieldGroup>
        </Host>
      ) : (
        <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="arrow.clockwise" onPress={() => void loadRequests(true)} />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 150 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadRequests(true)} />}
      >
        <Host style={{ width: '100%', height: contentHeight }}>
          <FieldGroup modifiers={[scrollDisabled()]}>
            <FieldGroup.Section title="Submitted Apps">
              {requests.length ? requests.map((request) => (
                <ListItem
                  key={request.id}
                  onPress={() => void openSource(request)}
                  supportingText={`${request.category} · ${methodLabel(request.method)}`}
                  trailing={<Text>Open</Text>}
                >
                  <Text>{request.name}</Text>
                </ListItem>
              )) : (
                <ListItem supportingText={loading ? 'Loading the GitHub request inbox…' : loadError || 'New submissions will appear here.'}>
                  <Text>{loading ? 'Loading Requests' : loadError ? 'Request Service Unavailable' : 'No Open Requests'}</Text>
                </ListItem>
              )}
            </FieldGroup.Section>

            <FieldGroup.Section title="How Requests Work">
              <ListItem>
                <Text>Consumer submissions become labeled GitHub issues. Tap a request to inspect its source, then import it with the developer tools.</Text>
              </ListItem>
              <Button onPress={() => void loadRequests(true)} disabled={loading}>
                <Text>{loading ? 'Refreshing…' : 'Refresh Requests'}</Text>
              </Button>
            </FieldGroup.Section>
          </FieldGroup>
        </Host>
      </ScrollView>
        </>
      )}
    </>
  );
}
