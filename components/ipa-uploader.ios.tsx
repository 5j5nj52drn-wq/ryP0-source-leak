import React from 'react';
import { Host } from '@expo/ui';
import { Button, ProgressView, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  font,
  foregroundStyle,
  frame,
  progressViewStyle,
} from '@expo/ui/swift-ui/modifiers';
import { type IpaUploaderProps, useIpaUploader } from './ipa-uploader-controller';

export default function IpaUploader({
  accentColor,
  disabled: externallyDisabled = false,
  labelColor,
  secondaryLabelColor,
  onUploaded,
}: IpaUploaderProps) {
  const upload = useIpaUploader(onUploaded);
  const buttonDisabled = externallyDisabled || upload.isPicking;

  return (
    <Host
      matchContents={{ vertical: true }}
      seedColor={accentColor}
      style={{ width: '100%', marginBottom: 16 }}
    >
      <VStack alignment="leading" spacing={9} modifiers={[frame({ maxWidth: 1000, alignment: 'leading' })]}>
        <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(labelColor)]}>
          Upload from Files
        </Text>
        <Button
          label={upload.buttonLabel}
          systemImage={upload.isUploading ? 'xmark.circle.fill' : 'arrow.up.doc.fill'}
          role={upload.isUploading ? 'cancel' : 'default'}
          onPress={upload.isUploading ? upload.cancelUpload : () => void upload.beginUpload()}
          modifiers={[
            buttonStyle('borderedProminent'),
            buttonBorderShape('roundedRectangle', 12),
            controlSize('large'),
            frame({ maxWidth: 1000 }),
            disabled(buttonDisabled),
          ]}
        />
        {upload.isPicking ? (
          <ProgressView modifiers={[progressViewStyle('circular')]} />
        ) : null}
        {upload.isUploading ? (
          <ProgressView
            value={upload.progress}
            modifiers={[frame({ maxWidth: 1000 }), progressViewStyle('linear')]}
          />
        ) : null}
        <Text
          modifiers={[
            font({ textStyle: 'footnote' }),
            foregroundStyle(upload.phase === 'error' ? '#FF3B30' : secondaryLabelColor),
          ]}
        >
          {upload.detail}
        </Text>
      </VStack>
    </Host>
  );
}
