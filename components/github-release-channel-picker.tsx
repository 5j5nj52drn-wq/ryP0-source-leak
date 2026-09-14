import React from 'react';
import { Host, Picker } from '@expo/ui';
import {
  GITHUB_RELEASE_CHANNEL_OPTIONS,
  isGitHubReleaseChannel,
  type GitHubReleaseChannel,
} from '../types/github-release-channel';

interface GitHubReleaseChannelPickerProps {
  accentColor: string;
  disabled?: boolean;
  onChange: (value: GitHubReleaseChannel) => void;
  value: GitHubReleaseChannel;
}

/** Android and web fallback for the native SwiftUI release-source picker. */
export default function GitHubReleaseChannelPicker({
  accentColor,
  disabled = false,
  onChange,
  value,
}: GitHubReleaseChannelPickerProps) {
  return (
    <Host seedColor={accentColor} style={{ height: 42, width: '100%' }}>
      <Picker
        selectedValue={value}
        onValueChange={(nextValue) => {
          if (isGitHubReleaseChannel(nextValue)) onChange(nextValue);
        }}
        enabled={!disabled}
        appearance="menu"
        testID="github-release-channel-picker"
      >
        {GITHUB_RELEASE_CHANNEL_OPTIONS.map((option) => (
          <Picker.Item key={option.id} label={option.label} value={option.id} />
        ))}
      </Picker>
    </Host>
  );
}
