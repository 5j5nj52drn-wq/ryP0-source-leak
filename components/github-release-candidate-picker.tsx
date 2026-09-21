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
import type { GitHubReleaseImportCandidate } from '../services/import-sources';
import { GITHUB_RELEASE_DISCOVERY_CHANNEL_LABELS } from '../types/github-release-channel';

type GitHubReleaseCandidatePickerProps = {
  accentColor: string;
  candidates: readonly GitHubReleaseImportCandidate[];
  disabled?: boolean;
  isLoading?: boolean;
  isTruncated?: boolean;
  onChange: (candidate: GitHubReleaseImportCandidate | null) => void;
  value: GitHubReleaseImportCandidate | null;
};

function formattedDate(value: string): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function candidateTitle(candidate: GitHubReleaseImportCandidate): string {
  return candidate.releaseName === candidate.releaseTag
    ? candidate.releaseTag
    : `${candidate.releaseName} · ${candidate.releaseTag}`;
}

/** Android/web fallback for the native SwiftUI candidate picker. */
export default function GitHubReleaseCandidatePicker({
  accentColor,
  candidates,
  disabled = false,
  isLoading = false,
  isTruncated = false,
  onChange,
  value,
}: GitHubReleaseCandidatePickerProps) {
  const [isPresented, setIsPresented] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((candidate) => (
      `${candidate.releaseName} ${candidate.releaseTag} ${candidate.assetName} ${candidate.publishedAt}`
    ).toLocaleLowerCase().includes(normalized));
  }, [candidates, query]);
  const selectedLabel = value
    ? `Selected · ${value.releaseTag}`
    : candidates.length
      ? `Choose exact release (${candidates.length})`
      : 'No installable releases found';

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Choose an exact GitHub release"
        disabled={disabled || isLoading}
        onPress={() => setIsPresented(true)}
        style={[styles.trigger, { borderColor: accentColor, opacity: disabled || isLoading ? 0.6 : 1 }]}
      >
        <Text style={[styles.triggerText, { color: accentColor }]}>{isLoading ? 'Loading GitHub releases…' : selectedLabel}</Text>
      </TouchableOpacity>
      <Modal visible={isPresented} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsPresented(false)}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose GitHub Release</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setIsPresented(false)}>
              <Text style={[styles.done, { color: accentColor }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Static imports keep this exact tag and IPA asset. Daily imports follow its channel and matching asset name.</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search release, tag, or IPA" style={styles.search} autoCapitalize="none" />
          <Pressable
            accessibilityRole="button"
            onPress={() => { onChange(null); setIsPresented(false); }}
            style={styles.row}
          >
            <Text style={styles.rowTitle}>Use selected source channel</Text>
            <Text style={styles.rowSubtitle}>Do not pin one release now</Text>
          </Pressable>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => { onChange(item); setIsPresented(false); }}
                style={styles.row}
              >
                <Text style={styles.rowTitle}>{candidateTitle(item)}</Text>
                <Text style={[styles.channel, { color: accentColor }]}>{GITHUB_RELEASE_DISCOVERY_CHANNEL_LABELS[item.channel]}</Text>
                <Text style={styles.rowSubtitle}>{item.assetName} · {formattedDate(item.publishedAt)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>{query ? 'No matching releases.' : 'No public IPA assets were found in GitHub releases.'}</Text>}
            ListFooterComponent={isTruncated ? <Text style={styles.footer}>Showing the newest 500 releases. Enter an exact Tag to use an older build.</Text> : null}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { alignItems: 'center', borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginBottom: 16, minHeight: 44 },
  triggerText: { fontSize: 16, fontWeight: '600' },
  sheet: { backgroundColor: '#FFFFFF', flex: 1, padding: 20 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: '#000000', fontSize: 20, fontWeight: '700' },
  done: { fontSize: 17, fontWeight: '600' },
  hint: { color: '#6C6C70', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  search: { backgroundColor: '#E5E5EA', borderRadius: 12, color: '#000000', fontSize: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 11 },
  row: { borderBottomColor: '#D1D1D6', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  rowTitle: { color: '#000000', fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: '#6C6C70', fontSize: 13, marginTop: 4 },
  channel: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  empty: { color: '#6C6C70', paddingTop: 24, textAlign: 'center' },
  footer: { color: '#6C6C70', fontSize: 12, lineHeight: 17, paddingVertical: 16, textAlign: 'center' },
});
