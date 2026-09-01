import { NativeTabs } from "expo-router/unstable-native-tabs";

export default function TabsLayout() {
  return (
    <NativeTabs tintColor="#007AFF" minimizeBehavior="onScrollDown">
      {/* 1. Left: Apps */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "square.stack.3d.up", selected: "square.stack.3d.up.fill" }} md="apps" />
        <NativeTabs.Trigger.Label>Apps</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* 2. Icons */}
      <NativeTabs.Trigger name="icons">
        <NativeTabs.Trigger.Icon sf={{ default: "app.badge", selected: "app.badge.fill" }} md="palette" />
        <NativeTabs.Trigger.Label>Icons</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* 3. Middle: Add App */}
      <NativeTabs.Trigger name="add">
        <NativeTabs.Trigger.Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} md="add_circle" />
        <NativeTabs.Trigger.Label>Add App</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* 4. Settings */}
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* 5. Far Right: Search */}
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} md="search" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
