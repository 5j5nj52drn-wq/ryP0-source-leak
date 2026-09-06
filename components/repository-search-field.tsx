import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

type RepositorySearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
};

export default function RepositorySearchField({ value, onChangeText }: RepositorySearchFieldProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="Search apps, bundle IDs..."
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#E5E5EA',
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 14,
  },
});
