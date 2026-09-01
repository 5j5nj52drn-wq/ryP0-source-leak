import { NativeTabs } from "expo-router/unstable-native-tabs";

export default function TabsLayout() {
  return (
    <NativeTabs tintColor="#007AFF" minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "square.stack.3d.up", selected: "square.stack.3d.up.fill" }} md="apps" />
        <NativeTabs.Trigger.Label>Apps</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="icons">
        <NativeTabs.Trigger.Icon sf={{ default: "app.badge", selected: "app.badge.fill" }} md="palette" />
        <NativeTabs.Trigger.Label>Icons</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
