import React, { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, useWindowDimensions } from 'react-native';
import { Host, FieldGroup, TextInput, Button, useNativeState, Text, ListItem, Picker } from '@expo/ui';
import { Stack } from 'expo-router';
import { submitAppRequest } from '../services/app-requests';
import type { AppRequestMethod } from '../types/app-request';
import { scrollDisabled } from '@expo/ui/swift-ui/modifiers';
import { getSafeExternalHttpsUrl } from '../services/safe-url';

const METHOD_LABELS: Record<AppRequestMethod, string> = {
  github: 'GitHub project or release',
  repository: 'Another app repository',
  'direct-url': 'Direct IPA download',
  'telegram-r2': 'Telegram / R2 import',
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
  const [method, setMethod] = useState<AppRequestMethod>('github');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);
  const { height: viewportHeight, fontScale } = useWindowDimensions();
  const formHeight = Math.max(viewportHeight + 180, 900 * Math.max(1, fontScale));

  const change = useCallback((state: { value: string }) => (value: string) => {
    'worklet';
    state.value = value;
  }, []);

  const handleSubmit = async () => {
    if (submitLock.current) return;
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

    const safeSourceUrl = getSafeExternalHttpsUrl(submission.sourceUrl);
    if (!safeSourceUrl) {
      Alert.alert('Use a Secure Source Link', 'App requests accept HTTPS links only.');
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    try {
      await submitAppRequest({ ...submission, sourceUrl: safeSourceUrl });
      name.value = '';
      description.value = '';
      setCategory('Sideloading');
      sourceUrl.value = '';
      setMethod('github');
      Alert.alert('Request Sent', 'Your app request has been sent to the repository developer for review.');
    } catch (error: any) {
      Alert.alert('Could Not Send Request', error?.message || 'Try again when you are connected.');
    } finally {
      submitLock.current = false;
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
                placeholder={method === 'direct-url' ? 'https://example.com/app.ipa' : method === 'telegram-r2' ? 'https://t.me/channel/123' : 'https://source.example.com'}
                autoCapitalize="none"
                keyboardType="url"
              />
              <FieldGroup.SectionFooter>
                <Text>
                  Requests are reviewed before import. Use a GitHub project, repository JSON, direct IPA URL, or public Telegram message link.
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
