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
  ProgressView,
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

/** A real SwiftUI bottom-sheet selector with local search for successful commits. */
export default function GitHubActionsCommitPicker({
  accentColor,
  commits,
  disabled: isDisabled = false,
  isLoading = false,
  onChange,
  value,
}: GitHubActionsCommitPickerProps) {
  const [isPresented, setIsPresented] = useState(false);
  const [queryValue, setQueryValue] = useState('');
  const query = useNativeState('');
  const filtered = useMemo(() => {
    const normalized = queryValue.trim().toLowerCase();
    if (!normalized) return commits;
    return commits.filter((commit) => `${commit.sha} ${commit.label} ${formattedDate(commit.commitDate)}`.toLowerCase().includes(normalized));
  }, [commits, queryValue]);
  const selectedLabel = value ? `Commit ${value.slice(0, 7)}` : 'Choose Actions Build';
  const handleSearch = useCallback((nextValue: string) => {
    query.value = nextValue;
    setQueryValue(nextValue);
  }, [query]);
  const choose = useCallback((commit: string) => {
    onChange(commit);
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
            <Label title={isLoading ? 'Loading Actions Builds…' : selectedLabel} systemImage="hammer.fill" />
          </Button>
        )}
      >
        <VStack spacing={12} modifiers={[padding({ horizontal: 16, top: 12, bottom: 4 })]}>
          <HStack>
            <Text modifiers={[font({ textStyle: 'title3', weight: 'bold' })]}>Choose Actions Build</Text>
            <Spacer />
            <Button label="Latest" systemImage="clock.arrow.circlepath" onPress={() => choose('')} modifiers={[buttonStyle('bordered'), tint(accentColor)]} />
          </HStack>
          <TextField
            text={query}
            onTextChange={handleSearch}
            placeholder="Search commit or build"
            modifiers={[
              textFieldStyle('roundedBorder'),
              frame({ maxWidth: 1_000 }),
            ]}
          />
          {isLoading ? (
            <HStack spacing={8} modifiers={[padding({ vertical: 22 })]}>
              <ProgressView />
              <Text modifiers={[foregroundStyle(Color.ios.secondaryLabel)]}>Loading successful builds…</Text>
            </HStack>
          ) : filtered.length ? (
            <List modifiers={[listStyle('insetGrouped'), frame({ minHeight: 220, maxHeight: 520 })]}>
              <Section title={`${filtered.length} successful build${filtered.length === 1 ? '' : 's'}`}>
                {filtered.map((commit) => (
                  <Button key={commit.sha} onPress={() => choose(commit.sha)} modifiers={[frame({ maxWidth: 1_000 })]}>
                    <VStack alignment="leading" spacing={3} modifiers={[padding({ vertical: 5 })]}>
                      <HStack>
                        <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' }), lineLimit(1)]}>{commit.label}</Text>
                        <Spacer />
                        {value === commit.sha ? <Label title="" systemImage="checkmark.circle.fill" modifiers={[foregroundStyle(accentColor)]} /> : null}
                      </HStack>
                      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(Color.ios.secondaryLabel)]}>
                        Commit date · {formattedDate(commit.commitDate)}
                      </Text>
                    </VStack>
                  </Button>
                ))}
              </Section>
            </List>
          ) : (
            <ContentUnavailableView
              title={queryValue ? 'No matching builds' : 'No successful builds'}
              systemImage="magnifyingglass"
              description={queryValue ? 'Try a commit SHA, workflow name, or date.' : 'This repository has no recent successful Actions builds.'}
              modifiers={[padding({ vertical: 30 })]}
            />
          )}
        </VStack>
      </BottomSheet>
    </Host>
  );
}
