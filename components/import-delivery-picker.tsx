import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Host, Picker } from '@expo/ui';
import {
  IMPORT_DELIVERY_MODE_OPTIONS,
  isImportDeliveryMode,
  type ImportDeliveryMode,
} from '../types/import-options';

type ImportDeliveryPickerProps = {
  accentColor: string;
  allowedModes?: readonly ImportDeliveryMode[];
  detail?: string;
  disabled?: boolean;
  onChange: (value: ImportDeliveryMode) => void;
  value: ImportDeliveryMode;
};

/** Android/web fallback. iOS loads the SwiftUI menu sibling. */
export default function ImportDeliveryPicker({
  accentColor,
  allowedModes = ['direct-source', 'mirror-release'],
  detail,
  disabled = false,
  onChange,
  value,
}: ImportDeliveryPickerProps) {
  const options = useMemo(
    () => IMPORT_DELIVERY_MODE_OPTIONS.filter((option) => allowedModes.includes(option.id)),
    [allowedModes],
  );

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>IPA delivery</Text>
      <Host seedColor={accentColor} style={{ height: 42, width: '100%' }}>
        <Picker
          selectedValue={value}
          onValueChange={(nextValue) => {
            if (isImportDeliveryMode(nextValue) && allowedModes.includes(nextValue)) onChange(nextValue);
          }}
          enabled={!disabled}
          appearance="menu"
          testID="import-delivery-picker"
        >
          {options.map((option) => (
            <Picker.Item key={option.id} label={option.label} value={option.id} />
          ))}
        </Picker>
      </Host>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { color: '#3C3C43', fontSize: 13, fontWeight: '600', marginBottom: 5 },
  detail: { color: '#6C6C70', fontSize: 12, lineHeight: 17, marginTop: 3 },
});
