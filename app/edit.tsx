import React, { useEffect, useCallback } from 'react';
import { View, Text as RNText, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRepoStore } from '../store/useRepoStore';
import { ListItem, FieldGroup, TextInput, Button, useNativeState, Host, Text } from '@expo/ui';

export default function EditAppScreen() {
  const { bundleIdentifier } = useLocalSearchParams<{ bundleIdentifier: string }>();
  const router = useRouter();
  const repo = useRepoStore((state) => state.repo);
  const updateApp = useRepoStore((state) => state.updateApp);

  const appIndex = repo?.apps.findIndex(a => a.bundleIdentifier === bundleIdentifier) ?? -1;
  const originalApp = appIndex >= 0 ? repo!.apps[appIndex] : null;

  const pendingIconSelection = useRepoStore((state) => state.pendingIconSelection);
  const setPendingIconSelection = useRepoStore((state) => state.setPendingIconSelection);

  const name = useNativeState('');
  const subtitle = useNativeState('');
  const developerName = useNativeState('');
  const iconURL = useNativeState('');
  const tintColor = useNativeState('');
  const category = useNativeState('');

  useEffect(() => {
    if (originalApp) {
      name.value = originalApp.name || '';
      subtitle.value = originalApp.subtitle || '';
      developerName.value = originalApp.developerName || '';
      iconURL.value = originalApp.iconURL || '';
      tintColor.value = originalApp.tintColor || '';
      category.value = originalApp.category || '';
    }
  }, [originalApp]);

  useEffect(() => {
    if (pendingIconSelection) {
      iconURL.value = pendingIconSelection;
      setPendingIconSelection(null);
    }
  }, [pendingIconSelection]);

  const handleChangeName = useCallback((value: string) => { 'worklet'; name.value = value; }, [name]);
  const handleChangeSubtitle = useCallback((value: string) => { 'worklet'; subtitle.value = value; }, [subtitle]);
  const handleChangeDeveloper = useCallback((value: string) => { 'worklet'; developerName.value = value; }, [developerName]);
  const handleChangeIconURL = useCallback((value: string) => { 'worklet'; iconURL.value = value; }, [iconURL]);
  const handleChangeTintColor = useCallback((value: string) => { 'worklet'; tintColor.value = value; }, [tintColor]);
  const handleChangeCategory = useCallback((value: string) => { 'worklet'; category.value = value; }, [category]);

  if (!originalApp) {
    return (
      <View style={styles.notFoundContainer}>
        <RNText style={styles.notFoundText}>App not found.</RNText>
      </View>
    );
  }

  const handleSave = () => {
    if (appIndex >= 0) {
      updateApp(appIndex, {
        ...originalApp,
        name: name.value,
        subtitle: subtitle.value,
        developerName: developerName.value,
        iconURL: iconURL.value,
        tintColor: tintColor.value,
        category: category.value,
      });
      router.back();
    }
  };

  return (
    <>
      <Stack.Screen 
        options={{ 
          title: 'Edit App',
          headerRight: () => (
            <TouchableOpacity onPress={handleSave} activeOpacity={0.7} style={styles.headerBtn}>
              <RNText style={styles.headerSaveText}>Save</RNText>
            </TouchableOpacity>
          ),
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.headerBtn}>
              <RNText style={styles.headerCancelText}>Cancel</RNText>
            </TouchableOpacity>
          )
        }} 
      />
      <Host style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="App Info">
            <TextInput value={name} onChangeText={handleChangeName} placeholder="App Name" />
            <TextInput value={subtitle} onChangeText={handleChangeSubtitle} placeholder="Subtitle" />
            <TextInput value={developerName} onChangeText={handleChangeDeveloper} placeholder="Developer Name" />
          </FieldGroup.Section>

          <FieldGroup.Section title="Bundle Identifier (Read-only)">
            <ListItem>
              <Text>{originalApp.bundleIdentifier}</Text>
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Assets">
            <TextInput 
              value={iconURL} 
              onChangeText={handleChangeIconURL} 
              placeholder="Icon URL (https://...)" 
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button onPress={() => router.push('/icons?mode=select')}>
              <Text>Browse Icon Gallery</Text>
            </Button>
          </FieldGroup.Section>

          <FieldGroup.Section title="Design">
            <TextInput 
              value={tintColor} 
              onChangeText={handleChangeTintColor} 
              placeholder="Tint Color (#000000)" 
              autoCapitalize="characters"
            />
            <TextInput 
              value={category} 
              onChangeText={handleChangeCategory} 
              placeholder="Category (e.g. Utilities)" 
            />
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </>
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
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerSaveText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 17,
  },
  headerCancelText: {
    color: '#007AFF',
    fontSize: 17,
  },
});
