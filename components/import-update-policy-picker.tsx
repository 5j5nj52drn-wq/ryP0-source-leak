import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Host, Picker } from '@expo/ui';
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

/** Android/web fallback. iOS loads the native SwiftUI picker sibling. */
export default function ImportUpdatePolicyPicker({
  accentColor,
  detail,
  disabled = false,
  onChange,
  value,
}: ImportUpdatePolicyPickerProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Update policy</Text>
      <Host seedColor={accentColor} style={{ height: 42, width: '100%' }}>
        <Picker
          selectedValue={value}
          onValueChange={(nextValue) => {
            if (nextValue === 'daily' || nextValue === 'static') onChange(nextValue);
          }}
          enabled={!disabled}
          appearance="menu"
          testID="import-update-policy-picker"
        >
          {IMPORT_UPDATE_POLICY_OPTIONS.map((option) => (
            <Picker.Item key={option.id} label={option.label} value={option.id} />
          ))}
        </Picker>
      </Host>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function ImportHistoryLimitPicker({
  accentColor,
  disabled = false,
  onChange,
  value,
}: ImportHistoryLimitPickerProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Keep version history</Text>
      <Host seedColor={accentColor} style={{ height: 42, width: '100%' }}>
        <Picker
          selectedValue={value}
          onValueChange={(nextValue) => {
            if (isImportHistoryLimit(nextValue)) onChange(nextValue);
          }}
          enabled={!disabled}
          appearance="menu"
          testID="import-history-limit-picker"
        >
          {IMPORT_HISTORY_LIMITS.map((limit) => (
            <Picker.Item key={limit} label={`${limit} ${limit === 1 ? 'version' : 'versions'}`} value={limit} />
          ))}
        </Picker>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { color: '#3C3C43', fontSize: 13, fontWeight: '600', marginBottom: 5 },
  detail: { color: '#6C6C70', fontSize: 12, lineHeight: 17, marginTop: 3 },
});
