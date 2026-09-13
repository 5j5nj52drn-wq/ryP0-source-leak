import React from 'react';
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Host } from '@expo/ui';
import { Button, ContextMenu, Menu, RNHostView, Section, ZStack } from '@expo/ui/swift-ui';
import { contentShape, shapes } from '@expo/ui/swift-ui/modifiers';

export interface AppCardContextMenuAction {
  id: string;
  title: string;
  image?: string;
  destructive?: boolean;
  onPress?: () => void;
  subactions?: AppCardContextMenuAction[];
}

interface AppCardContextMenuProps {
  title: string;
  actions: AppCardContextMenuAction[];
  children: ReactElement;
  preview: ReactElement;
  style?: StyleProp<ViewStyle>;
}

function ContextMenuAction({ action }: { action: AppCardContextMenuAction }) {
  if (action.subactions?.length) {
    return (
      <Menu label={action.title} systemImage={action.image}>
        {action.subactions.map((subaction) => (
          <ContextMenuAction action={subaction} key={subaction.id} />
        ))}
      </Menu>
    );
  }

  return (
    <Button
      label={action.title}
      systemImage={action.image as any}
      role={action.destructive ? 'destructive' : undefined}
      onPress={action.onPress}
    />
  );
}

/**
 * A true SwiftUI ContextMenu that deliberately keeps its trigger transparent.
 * The painted app card remains a regular React Native list cell, avoiding the
 * SwiftUI measurement/recycling issue that occurs when a full card is hosted
 * inside a DraggableFlatList row.
 */
export default function AppCardContextMenu({
  title,
  actions,
  children,
  preview,
  style,
}: AppCardContextMenuProps) {
  return (
    <Host matchContents style={style} ignoreSafeArea="all">
      <ContextMenu>
        <ContextMenu.Trigger>
          <ZStack
            modifiers={[
              contentShape(
                shapes.roundedRectangle({ cornerRadius: 22, roundedCornerStyle: 'continuous' }),
                ['interaction', 'contextMenuPreview'],
              ),
            ]}
          >
            <RNHostView matchContents>{children}</RNHostView>
          </ZStack>
        </ContextMenu.Trigger>
        <ContextMenu.Preview>
          <RNHostView matchContents>{preview}</RNHostView>
        </ContextMenu.Preview>
        <ContextMenu.Items>
          <Section title={title}>
            {actions.map((action) => (
              <ContextMenuAction action={action} key={action.id} />
            ))}
          </Section>
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
