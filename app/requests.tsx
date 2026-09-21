import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { Host, FieldGroup, ListItem, Text, Button } from '@expo/ui';
import { scrollDisabled } from '@expo/ui/swift-ui/modifiers';
import { approveAppRequest, fetchAppRequests } from '../services/app-requests';
import { AdminRouteGate } from '../components/admin-route-gate';
import type { AppRequestMethod, AppRequestRecord } from '../types/app-request';
import { useRepoStore } from '../store/useRepoStore';
import { getSafeExternalHttpsUrl } from '../services/safe-url';

function methodLabel(method: AppRequestRecord['method']) {
  if (method === 'direct-url') return 'Direct IPA';
  if (method === 'telegram-r2') return 'Telegram / R2';
  if (method === 'repository') return 'Repository';
  return 'GitHub';
}

function suggestedMethod(request: AppRequestRecord): AppRequestMethod {
  const source = request.sourceUrl.toLowerCase();
  if (source.includes('t.me/') || source.includes('telegram.me/')) return 'telegram-r2';
  if (/\.ipa(?:$|[?#])/.test(source)) return 'direct-url';
  if (source.endsWith('.json') || source.includes('repo.json') || source.includes('source.json')) return 'repository';
  return 'github';
}

export default function AppRequestsScreen() {
  return (
    <AdminRouteGate title="App Requests">
      <AuthorizedAppRequestsScreen />
    </AdminRouteGate>
  );
}

function AuthorizedAppRequestsScreen() {
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

  const approveAndQueue = (request: AppRequestRecord) => {
    const suggested = suggestedMethod(request);
    Alert.alert(
      'Approve This Import?',
      `Suggested: ${methodLabel(suggested)}. ryP0 will queue a private import for ${request.name}. The app will not be published unless the importer validates its IPA and catalog data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Queue',
          onPress: () => {
            void (async () => {
              try {
                await approveAppRequest({ ...request, method: suggested });
                setRequests((current) => current.filter((candidate) => candidate.id !== request.id));
                Alert.alert('Import Queued', 'The private importer will validate the source before it can update the public catalog.');
              } catch (error: any) {
                Alert.alert('Could Not Queue Import', error?.message || 'Check the private control service and try again.');
              }
            })();
          },
        },
      ],
    );
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
                  supportingText={`${request.category} · Suggested: ${methodLabel(suggestedMethod(request))}`}
                  trailing={
                    <Button onPress={() => approveAndQueue(request)}>
                      <Text>Approve</Text>
                    </Button>
                  }
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
                <Text>Consumer submissions become private GitHub issues. Tap a request to inspect its source, then approve it to queue the protected importer.</Text>
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
