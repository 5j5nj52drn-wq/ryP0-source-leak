import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { FloatingNavBar } from '../../components/FloatingNavBar';

export default function TabsLayout() {
  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Native morphing FloatingNavBar handles the navigation
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Apps',
          }}
        />
        <Tabs.Screen
          name="icons"
          options={{
            title: 'Icons',
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: 'Add App',
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
          }}
        />
      </Tabs>
      <FloatingNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
