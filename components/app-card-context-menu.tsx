import React, { useMemo } from 'react';
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { MenuView } from '@expo/ui/community/menu';

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

function toNativeActions(actions: AppCardContextMenuAction[]): any[] {
  return actions.map((action) => ({
    id: action.id,
    title: action.title,
    image: action.image,
    attributes: action.destructive ? { destructive: true } : undefined,
    subactions: action.subactions ? toNativeActions(action.subactions) : undefined,
  }));
}

function findAction(actions: AppCardContextMenuAction[], id: string): AppCardContextMenuAction | undefined {
  for (const action of actions) {
    if (action.id === id) return action;
    const nested = action.subactions ? findAction(action.subactions, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

/** Native iOS has a preview-capable implementation in the .ios file. */
export default function AppCardContextMenu({ title, actions, children, style }: AppCardContextMenuProps) {
  const nativeActions = useMemo(() => toNativeActions(actions), [actions]);

  return (
    <MenuView
      shouldOpenOnLongPress
      title={title}
      actions={nativeActions}
      onPressAction={({ nativeEvent }) => findAction(actions, nativeEvent.event)?.onPress?.()}
      style={style}
    >
      {children}
    </MenuView>
  );
}
