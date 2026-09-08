import React from 'react';
import { Host, Picker } from '@expo/ui';
import {
  RepositoryImportReviewBase,
  type RepositoryCategoryPickerProps,
  type RepositoryImportReviewProps,
} from './repository-import-review-base';

function CategoryPicker({
  accentColor,
  categories,
  disabled,
  onChange,
  value,
}: RepositoryCategoryPickerProps) {
  return (
    <Host seedColor={accentColor} style={{ height: 36, width: 156 }}>
      <Picker selectedValue={value} onValueChange={onChange} enabled={!disabled} appearance="menu">
        {categories.map((category) => (
          <Picker.Item key={category.id} label={category.label} value={category.id} />
        ))}
      </Picker>
    </Host>
  );
}

export default function RepositoryImportReview(props: RepositoryImportReviewProps) {
  return <RepositoryImportReviewBase {...props} CategoryPicker={CategoryPicker} />;
}

export type {
  RepositoryImportCategory,
  RepositoryImportReviewColors,
  StagedRepositoryApp,
} from './repository-import-review-base';
