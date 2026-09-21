import React, { useCallback, useMemo, useState } from 'react';
import { Color } from 'expo-router';
import { Host } from '@expo/ui';
import {
  BottomSheet,
  Button,
  ContentUnavailableView,
  HStack,
  Label,
  List,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  listStyle,
  padding,
  textFieldStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { GitHubReleaseImportCandidate } from '../services/import-sources';
import {
  GITHUB_RELEASE_DISCOVERY_CHANNEL_LABELS,
  GITHUB_RELEASE_DISCOVERY_CHANNELS,
} from '../types/github-release-channel';

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

/**
 * A real SwiftUI sheet for choosing one exact release/tag/IPA asset pair.
 * The selection only carries public release metadata; no GitHub credential is
 * involved and private automation repeats validation before publishing.
 */
export default function GitHubReleaseCandidatePicker({
  accentColor,
  candidates,
  disabled: isDisabled = false,
  isLoading = false,
  isTruncated = false,
  onChange,
  value,
}: GitHubReleaseCandidatePickerProps) {
  const [isPresented, setIsPresented] = useState(false);
  const [queryValue, setQueryValue] = useState('');
  const query = useNativeState('');
  const filtered = useMemo(() => {
    const normalized = queryValue.trim().toLocaleLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((candidate) => (
      `${candidate.releaseName} ${candidate.releaseTag} ${candidate.assetName} ${candidate.publishedAt}`
    ).toLocaleLowerCase().includes(normalized));
  }, [candidates, queryValue]);
  const groups = useMemo(() => GITHUB_RELEASE_DISCOVERY_CHANNELS
    .map((channel) => ({
      channel,
      candidates: filtered.filter((candidate) => candidate.channel === channel),
    }))
    .filter((group) => group.candidates.length > 0), [filtered]);
  const selectedLabel = value
    ? `Selected · ${value.releaseTag}`
    : candidates.length
      ? `Choose exact release (${candidates.length})`
      : 'No installable releases found';

  const handleSearch = useCallback((nextValue: string) => {
    query.value = nextValue;
    setQueryValue(nextValue);
  }, [query]);
  const choose = useCallback((candidate: GitHubReleaseImportCandidate | null) => {
    onChange(candidate);
    setIsPresented(false);
  }, [onChange]);

  return (
    <Host seedColor={accentColor} style={{ height: 48, width: '100%' }}>
      <BottomSheet
        isPresented={isPresented}
        onIsPresentedChange={setIsPresented}
        anchor={(
          <Button
            onPress={() => setIsPresented(true)}
            modifiers={[
              buttonStyle('bordered'),
              tint(accentColor),
              disabled(isDisabled || isLoading),
              frame({ maxWidth: 1_000, height: 44 }),
            ]}
          >
            <Label title={isLoading ? 'Loading GitHub releases…' : selectedLabel} systemImage="shippingbox.and.arrow.backward" />
          </Button>
        )}
      >
        <VStack spacing={12} modifiers={[padding({ horizontal: 16, top: 12, bottom: 4 })]}>
          <HStack>
            <Text modifiers={[font({ textStyle: 'title3', weight: 'bold' })]}>Choose GitHub Release</Text>
            <Spacer />
            <Button
              label="Use channel"
              systemImage="arrow.triangle.branch"
              onPress={() => choose(null)}
              modifiers={[buttonStyle('bordered'), tint(accentColor)]}
            />
          </HStack>
          <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(Color.ios.secondaryLabel)]}>
            Static imports keep this exact tag and IPA asset. Daily imports follow this channel and matching asset name.
          </Text>
          <TextField
            text={query}
            onTextChange={handleSearch}
            placeholder="Search release, tag, or IPA"
            modifiers={[
              textFieldStyle('roundedBorder'),
              frame({ maxWidth: 1_000 }),
            ]}
          />
          {groups.length ? (
            <List modifiers={[listStyle('insetGrouped'), frame({ minHeight: 240, maxHeight: 540 })]}>
              {groups.map((group) => (
                <Section key={group.channel} title={`${GITHUB_RELEASE_DISCOVERY_CHANNEL_LABELS[group.channel]} · ${group.candidates.length}`}>
                  {group.candidates.map((candidate) => (
                    <Button key={candidate.id} onPress={() => choose(candidate)} modifiers={[frame({ maxWidth: 1_000 })]}>
                      <VStack alignment="leading" spacing={3} modifiers={[padding({ vertical: 5 })]}>
                        <HStack>
                          <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' }), lineLimit(1)]}>{candidateTitle(candidate)}</Text>
                          <Spacer />
                          {value?.id === candidate.id ? <Label title="" systemImage="checkmark.circle.fill" modifiers={[foregroundStyle(accentColor)]} /> : null}
                        </HStack>
                        <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(Color.ios.secondaryLabel), lineLimit(1)]}>
                          {candidate.assetName} · {formattedDate(candidate.publishedAt)}
                        </Text>
                      </VStack>
                    </Button>
                  ))}
                </Section>
              ))}
            </List>
          ) : (
            <ContentUnavailableView
              title={queryValue ? 'No matching releases' : 'No installable releases'}
              systemImage="shippingbox"
              description={queryValue
                ? 'Try a release name, tag, or IPA filename.'
                : 'No public IPA assets were found in this repository’s GitHub releases.'}
              modifiers={[padding({ vertical: 30 })]}
            />
          )}
          {isTruncated ? (
            <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(Color.ios.secondaryLabel), padding({ bottom: 8 })]}>
              Showing the newest 500 GitHub releases. Search or enter an exact Tag for older builds.
            </Text>
          ) : null}
        </VStack>
      </BottomSheet>
    </Host>
  );
}
