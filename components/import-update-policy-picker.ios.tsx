import React from 'react';
import { Host } from '@expo/ui';
import { Picker, Text, VStack } from '@expo/ui/swift-ui';
import {
  controlSize,
  disabled,
  font,
  foregroundStyle,
  frame,
  pickerStyle,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { AppUpdatePolicy } from '../types/repo';
import {
  IMPORT_HISTORY_LIMITS,
  IMPORT_UPDATE_POLICY_OPTIONS,
  isImportHistoryLimit,
  type ImportHistoryLimit,
} from '../types/import-options';

type ImportUpdatePolicyPickerProps = {
  accentColor: string;
  detail?: string;
  disabled?: boolean;
  onChange: (value: AppUpdatePolicy) => void;
  value: AppUpdatePolicy;
};

type ImportHistoryLimitPickerProps = {
  accentColor: string;
  disabled?: boolean;
  onChange: (value: ImportHistoryLimit) => void;
  value: ImportHistoryLimit;
};

/** Real SwiftUI menu for daily tracked imports versus static manual history. */
export default function ImportUpdatePolicyPicker({
  accentColor,
  detail,
  disabled: isDisabled = false,
  onChange,
  value,
}: ImportUpdatePolicyPickerProps) {
  return (
    <Host seedColor={accentColor} style={{ height: detail ? 70 : 48, width: '100%' }}>
      <VStack alignment="leading" spacing={2}>
        <Picker
          label="Update policy"
          systemImage="arrow.triangle.2.circlepath"
          selection={value}
          onSelectionChange={(nextValue) => {
            if (nextValue === 'daily' || nextValue === 'static') onChange(nextValue);
          }}
          modifiers={[
            pickerStyle('menu'),
            controlSize('regular'),
            tint(accentColor),
            frame({ maxWidth: 1_000, alignment: 'leading' }),
            disabled(isDisabled),
          ]}
          testID="import-update-policy-picker"
        >
          {IMPORT_UPDATE_POLICY_OPTIONS.map((option) => (
            <Text key={option.id} modifiers={[tag(option.id)]}>{option.label}</Text>
          ))}
        </Picker>
        {detail ? (
          <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
            {detail}
          </Text>
        ) : null}
      </VStack>
    </Host>
  );
}

/** Static imports can retain a manual version history; daily imports always keep one current version. */
export function ImportHistoryLimitPicker({
  accentColor,
  disabled: isDisabled = false,
  onChange,
  value,
}: ImportHistoryLimitPickerProps) {
  return (
    <Host seedColor={accentColor} style={{ height: 48, width: '100%' }}>
      <Picker
        label="Keep version history"
        systemImage="clock.arrow.circlepath"
        selection={value}
        onSelectionChange={(nextValue) => {
          if (isImportHistoryLimit(nextValue)) onChange(nextValue);
        }}
        modifiers={[
          pickerStyle('menu'),
          controlSize('regular'),
          tint(accentColor),
          frame({ maxWidth: 1_000, alignment: 'leading' }),
          disabled(isDisabled),
        ]}
        testID="import-history-limit-picker"
      >
        {IMPORT_HISTORY_LIMITS.map((limit) => (
          <Text key={limit} modifiers={[tag(limit)]}>{`${limit} ${limit === 1 ? 'version' : 'versions'}`}</Text>
        ))}
      </Picker>
    </Host>
  );
}
