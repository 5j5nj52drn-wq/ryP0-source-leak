import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { GitHubActionBuildCommit } from '../services/github-action-builds';

type GitHubActionsCommitPickerProps = {
  accentColor: string;
  commits: readonly GitHubActionBuildCommit[];
  disabled?: boolean;
  isLoading?: boolean;
  onChange: (commit: string) => void;
  value: string;
};

function formattedDate(value?: string): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Web/Android fallback. iOS uses the native SwiftUI sheet sibling. */
export default function GitHubActionsCommitPicker({
  accentColor,
  commits,
  disabled = false,
  isLoading = false,
  onChange,
  value,
}: GitHubActionsCommitPickerProps) {
  const [isPresented, setIsPresented] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commits;
    return commits.filter((commit) => `${commit.sha} ${commit.label} ${formattedDate(commit.commitDate)}`.toLowerCase().includes(normalized));
  }, [commits, query]);
  const selectedLabel = value ? `Commit ${value.slice(0, 7)}` : 'Choose Actions Build';

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Choose GitHub Actions build commit"
        disabled={disabled || isLoading}
        onPress={() => setIsPresented(true)}
        style={[styles.trigger, { borderColor: accentColor, opacity: disabled || isLoading ? 0.6 : 1 }]}
      >
        <Text style={[styles.triggerText, { color: accentColor }]}>{isLoading ? 'Loading Actions builds…' : selectedLabel}</Text>
      </TouchableOpacity>
      <Modal visible={isPresented} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsPresented(false)}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose Actions Build</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setIsPresented(false)}>
              <Text style={[styles.done, { color: accentColor }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search commit or build" style={styles.search} autoCapitalize="none" />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => { onChange(''); setIsPresented(false); }}
            style={styles.row}
          >
            <Text style={styles.rowTitle}>Latest successful build</Text>
            <Text style={styles.rowSubtitle}>No commit filter</Text>
          </TouchableOpacity>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.sha}
            renderItem={({ item }) => (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => { onChange(item.sha); setIsPresented(false); }}
                style={styles.row}
              >
                <Text style={styles.rowTitle}>{item.label}</Text>
                <Text style={styles.rowSubtitle}>Commit date · {formattedDate(item.commitDate)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No matching successful builds.</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, marginBottom: 16 },
  triggerText: { fontSize: 16, fontWeight: '600' },
  sheet: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: '#000000', fontSize: 20, fontWeight: '700' },
  done: { fontSize: 17, fontWeight: '600' },
  search: { backgroundColor: '#E5E5EA', borderRadius: 12, color: '#000000', fontSize: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 11 },
  row: { borderBottomColor: '#D1D1D6', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  rowTitle: { color: '#000000', fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: '#6C6C70', fontSize: 13, marginTop: 4 },
  empty: { color: '#6C6C70', paddingTop: 24, textAlign: 'center' },
});
