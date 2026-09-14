import React from 'react';
import { Host } from '@expo/ui';
import { Picker, Text } from '@expo/ui/swift-ui';
import {
  controlSize,
  disabled,
  frame,
  pickerStyle,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
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

/** A real SwiftUI menu, so the release source behaves like an iOS form row. */
export default function GitHubReleaseChannelPicker({
  accentColor,
  disabled: isDisabled = false,
  onChange,
  value,
}: GitHubReleaseChannelPickerProps) {
  return (
    <Host seedColor={accentColor} style={{ height: 42, width: '100%' }}>
      <Picker
        label="Build source"
        systemImage="shippingbox.fill"
        selection={value}
        onSelectionChange={(nextValue) => {
          if (isGitHubReleaseChannel(nextValue)) onChange(nextValue);
        }}
        modifiers={[
          pickerStyle('menu'),
          controlSize('regular'),
          tint(accentColor),
          frame({ maxWidth: 1_000, alignment: 'leading' }),
          disabled(isDisabled),
        ]}
        testID="github-release-channel-picker"
      >
        {GITHUB_RELEASE_CHANNEL_OPTIONS.map((option) => (
          <Text key={option.id} modifiers={[tag(option.id)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
