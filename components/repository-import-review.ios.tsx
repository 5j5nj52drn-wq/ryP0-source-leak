import React from 'react';
import { Host } from '@expo/ui';
import { Picker, Text } from '@expo/ui/swift-ui';
import {
  controlSize,
  disabled,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import {
  RepositoryImportReviewBase,
  type RepositoryCategoryPickerProps,
  type RepositoryImportReviewProps,
} from './repository-import-review-base';

function SwiftUICategoryPicker({
  accentColor,
  categories,
  disabled: isDisabled,
  onChange,
  value,
}: RepositoryCategoryPickerProps) {
  return (
    <Host seedColor={accentColor} style={{ height: 36, width: 156 }}>
      <Picker
        selection={value}
        onSelectionChange={(selection) => onChange(selection || value)}
        modifiers={[
          pickerStyle('menu'),
          controlSize('small'),
          frame({ maxWidth: 156, alignment: 'leading' }),
          disabled(isDisabled),
        ]}
        testID={`category-picker-${value}`}
      >
        {categories.map((category) => (
          <Text key={category.id} modifiers={[tag(category.id)]}>
            {category.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

export default function RepositoryImportReview(props: RepositoryImportReviewProps) {
  return <RepositoryImportReviewBase {...props} CategoryPicker={SwiftUICategoryPicker} />;
}

export type {
  RepositoryImportCategory,
  RepositoryImportReviewColors,
  StagedRepositoryApp,
} from './repository-import-review-base';
