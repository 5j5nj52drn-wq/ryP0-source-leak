import React, { useCallback, useEffect } from 'react';
import { Color } from 'expo-router';
import { Host } from '@expo/ui';
import { HStack, Image, TextField, useNativeState } from '@expo/ui/swift-ui';
import {
  background,
  frame,
  foregroundStyle,
  padding,
  shapes,
  textFieldStyle,
} from '@expo/ui/swift-ui/modifiers';

type RepositorySearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
};

export default function RepositorySearchField({ value, onChangeText }: RepositorySearchFieldProps) {
  const query = useNativeState(value);

  useEffect(() => {
    if (query.value !== value) query.value = value;
  }, [query, value]);

  const handleChange = useCallback((nextValue: string) => {
    query.value = nextValue;
    onChangeText(nextValue);
  }, [onChangeText, query]);

  return (
    <Host style={{ height: 48, width: '100%' }}>
      <HStack
        spacing={8}
        modifiers={[
          frame({ maxWidth: 1000, height: 48 }),
          padding({ horizontal: 14 }),
          background(Color.ios.secondarySystemBackground, shapes.capsule()),
        ]}
      >
        <Image systemName="magnifyingglass" size={17} color={Color.ios.secondaryLabel} />
        <TextField
          text={query}
          onTextChange={handleChange}
          placeholder="Search apps, bundle IDs..."
          modifiers={[
            frame({ maxWidth: 1000 }),
            foregroundStyle(Color.ios.label),
            textFieldStyle('plain'),
          ]}
        />
      </HStack>
    </Host>
  );
}
