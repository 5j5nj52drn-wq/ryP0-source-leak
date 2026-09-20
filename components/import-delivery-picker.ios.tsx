import React, { useMemo } from 'react';
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

/** Real SwiftUI menu for choosing whether ryP0 links to or mirrors an IPA. */
export default function ImportDeliveryPicker({
  accentColor,
  allowedModes = ['direct-source', 'mirror-release'],
  detail,
  disabled: isDisabled = false,
  onChange,
  value,
}: ImportDeliveryPickerProps) {
  const options = useMemo(
    () => IMPORT_DELIVERY_MODE_OPTIONS.filter((option) => allowedModes.includes(option.id)),
    [allowedModes],
  );

  return (
    <Host seedColor={accentColor} style={{ height: detail ? 70 : 48, width: '100%' }}>
      <VStack alignment="leading" spacing={2}>
        <Picker
          label="IPA delivery"
          systemImage="arrow.triangle.2.circlepath"
          selection={value}
          onSelectionChange={(nextValue) => {
            if (isImportDeliveryMode(nextValue) && allowedModes.includes(nextValue)) onChange(nextValue);
          }}
          modifiers={[
            pickerStyle('menu'),
            controlSize('regular'),
            tint(accentColor),
            frame({ maxWidth: 1_000, alignment: 'leading' }),
            disabled(isDisabled),
          ]}
          testID="import-delivery-picker"
        >
          {options.map((option) => (
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
