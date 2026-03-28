import { Tabs } from "expo-router";
import { Home, Radio, Video, Newspaper, Info } from "lucide-react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useSplash } from "@/providers/SplashProvider";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isSplashVisible } = useSplash();
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.dark.accent,
        tabBarInactiveTintColor: Colors.dark.textSecondary,
        tabBarStyle: isSplashVisible
          ? { display: 'none' as const }
          : {
              backgroundColor: Colors.dark.surface,
              borderTopColor: Colors.dark.border,
              borderTopWidth: 1,
              paddingTop: 8,
              paddingBottom: insets.bottom + 8,
              height: 60 + insets.bottom,
            },
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: "Live",
          tabBarIcon: ({ color, size }) => <Radio color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: "Video",
          tabBarIcon: ({ color, size }) => <Video color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: "News",
          tabBarIcon: ({ color, size }) => <Newspaper color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="info"
        options={{
          title: "Info",
          tabBarIcon: ({ color, size }) => <Info color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
