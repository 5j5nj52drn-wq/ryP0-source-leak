import React, { useCallback, useEffect } from 'react';
import { Text as RNText, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import {
  Button,
  FieldGroup,
  Host,
  ListItem,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';
import type { EditAppFormProps } from '../types/edit-app-form';

export default function EditAppForm({
  app,
  pendingIconSelection,
  onConsumePendingIconSelection,
  onBrowseIcons,
  onCancel,
  onSave,
}: EditAppFormProps) {
  const name = useNativeState(app.name || '');
  const subtitle = useNativeState(app.subtitle || '');
  const iconURL = useNativeState(app.iconURL || '');
  const tintColor = useNativeState(app.tintColor || '');
  const category = useNativeState(app.category || '');

  useEffect(() => {
    if (!pendingIconSelection) return;
    iconURL.value = pendingIconSelection;
    onConsumePendingIconSelection();
  }, [pendingIconSelection, onConsumePendingIconSelection]);

  const setName = useCallback((value: string) => { 'worklet'; name.value = value; }, [name]);
  const setSubtitle = useCallback((value: string) => { 'worklet'; subtitle.value = value; }, [subtitle]);
  const setIconURL = useCallback((value: string) => { 'worklet'; iconURL.value = value; }, [iconURL]);
  const setTintColor = useCallback((value: string) => { 'worklet'; tintColor.value = value; }, [tintColor]);
  const setCategory = useCallback((value: string) => { 'worklet'; category.value = value; }, [category]);

  const handleSave = () => onSave({
    name: name.value,
    subtitle: subtitle.value,
    iconURL: iconURL.value,
    tintColor: tintColor.value,
    category: category.value,
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Edit',
          headerLeft: () => (
            <TouchableOpacity onPress={onCancel}>
              <RNText>Cancel</RNText>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleSave}>
              <RNText>Save</RNText>
            </TouchableOpacity>
          ),
        }}
      />
      <Host style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="App Info">
            <TextInput value={name} onChangeText={setName} placeholder="App Name" />
            <TextInput value={subtitle} onChangeText={setSubtitle} placeholder="Subtitle" />
          </FieldGroup.Section>
          <FieldGroup.Section title="Bundle Identifier (Read-only)">
            <ListItem><Text>{app.bundleIdentifier}</Text></ListItem>
          </FieldGroup.Section>
          <FieldGroup.Section title="Assets">
            <TextInput value={iconURL} onChangeText={setIconURL} placeholder="Icon URL" />
            <Button onPress={onBrowseIcons}><Text>Browse Icon Gallery</Text></Button>
          </FieldGroup.Section>
          <FieldGroup.Section title="Design">
            <TextInput value={tintColor} onChangeText={setTintColor} placeholder="Tint Color" />
            <TextInput value={category} onChangeText={setCategory} placeholder="Category" />
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </>
  );
}
