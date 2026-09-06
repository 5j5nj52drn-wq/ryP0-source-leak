import React, { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, useWindowDimensions } from 'react-native';
import { Host, FieldGroup, TextInput, Button, useNativeState, Text, ListItem, Picker } from '@expo/ui';
import { Stack } from 'expo-router';
import { submitAppRequest } from '../services/app-requests';
import type { AppRequestMethod } from '../types/app-request';
import { scrollDisabled } from '@expo/ui/swift-ui/modifiers';

const METHOD_LABELS: Record<AppRequestMethod, string> = {
  'updatable-source': 'Updatable source',
  'direct-ipa': 'Direct IPA download',
  'message-link': 'Message / Telegram link',
};

const REQUEST_CATEGORIES = [
  'Sideloading',
  'Games',
  'Social',
  'EMU',
  'Movies',
  'Tools',
] as const;

export default function AppRequestForm() {
  const name = useNativeState('');
  const description = useNativeState('');
  const sourceUrl = useNativeState('');
  const [category, setCategory] = useState<(typeof REQUEST_CATEGORIES)[number]>('Sideloading');
  const [method, setMethod] = useState<AppRequestMethod>('updatable-source');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { height: viewportHeight, fontScale } = useWindowDimensions();
  const formHeight = Math.max(viewportHeight + 180, 900 * Math.max(1, fontScale));

  const change = useCallback((state: { value: string }) => (value: string) => {
    'worklet';
    state.value = value;
  }, []);

  const handleSubmit = async () => {
    const submission = {
      name: name.value.trim(),
      description: description.value.trim(),
      category,
      sourceUrl: sourceUrl.value.trim(),
      method,
    };

    if (!submission.name || !submission.description || !submission.category || !submission.sourceUrl) {
      Alert.alert('Complete the Request', 'Name, description, category, and a source link are required.');
      return;
    }

    try {
      const source = new URL(submission.sourceUrl);
      if (source.protocol !== 'https:' || source.username || source.password) throw new Error('unsafe');
    } catch {
      Alert.alert('Use a Secure Source Link', 'App requests accept HTTPS links only.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitAppRequest(submission);
      if (result.kind === 'continue-in-github') {
        Alert.alert(
          'Continue in GitHub',
          'A secure, prefilled request form is ready in GitHub. Sign in there and tap Submit to send your request. Your details will stay here if you need to come back.',
          [
            { text: 'Not Now', style: 'cancel' },
            {
              text: 'Open GitHub',
              onPress: () => {
                void Linking.openURL(result.url).catch(() => {
                  Alert.alert('Could Not Open GitHub', 'Open GitHub in your browser and submit the request there.');
                });
              },
            },
          ],
        );
        return;
      }
      name.value = '';
      description.value = '';
      setCategory('Sideloading');
      sourceUrl.value = '';
      setMethod('updatable-source');
      Alert.alert('Request Sent', 'Your app request has been sent to the repository developer for review.');
    } catch (error: any) {
      Alert.alert('Could Not Send Request', error?.message || 'Try again when you are connected.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Request an App', headerLargeTitle: true }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        <Host style={{ width: '100%', height: formHeight }}>
          <FieldGroup modifiers={[scrollDisabled()]}>
            <FieldGroup.Section title="Request an App">
              <ListItem>
                <Text>Send an app source to the repository developer. Requests are reviewed before they are published.</Text>
              </ListItem>
            </FieldGroup.Section>

            <FieldGroup.Section title="App Details">
              <TextInput value={name} onChangeText={change(name)} placeholder="App name" />
              <TextInput value={description} onChangeText={change(description)} placeholder="Short description" />
              <ListItem
                trailing={
                  <Picker<(typeof REQUEST_CATEGORIES)[number]>
                    selectedValue={category}
                    onValueChange={setCategory}
                    appearance="menu"
                  >
                    {REQUEST_CATEGORIES.map((value) => (
                      <Picker.Item key={value} value={value} label={value} />
                    ))}
                  </Picker>
                }
              >
                <Text>Category</Text>
              </ListItem>
            </FieldGroup.Section>

            <FieldGroup.Section title="Source">
              <ListItem
                trailing={
                  <Picker<AppRequestMethod>
                    selectedValue={method}
                    onValueChange={setMethod}
                    appearance="menu"
                  >
                    {Object.entries(METHOD_LABELS).map(([value, label]) => (
                      <Picker.Item key={value} value={value as AppRequestMethod} label={label} />
                    ))}
                  </Picker>
                }
              >
                <Text>Submission method</Text>
              </ListItem>
              <TextInput
                value={sourceUrl}
                onChangeText={change(sourceUrl)}
                placeholder={method === 'direct-ipa' ? 'https://example.com/app.ipa' : 'https://source.example.com'}
                autoCapitalize="none"
                keyboardType="url"
              />
              <FieldGroup.SectionFooter>
                <Text>
                  Use an updateable project or release link when possible. Direct IPA and Telegram/message links are accepted for review.
                </Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>

            <FieldGroup.Section>
              <Button onPress={handleSubmit} disabled={isSubmitting}>
                <Text>{isSubmitting ? 'Sending Request…' : 'Send App Request'}</Text>
              </Button>
            </FieldGroup.Section>
          </FieldGroup>
        </Host>
      </ScrollView>
    </>
  );
}
