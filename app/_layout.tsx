import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar, Platform } from "react-native";
import Colors from "@/constants/colors";
import { UserPreferencesProvider } from "@/providers/UserPreferencesProvider";
import { SplashProvider } from "@/providers/SplashProvider";
import { setupGlobalErrorHandler } from "@/lib/errorReporter";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen 
        name="player" 
        options={{ 
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "fade"
        }} 
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
    if (Platform.OS !== 'web') {
      setupGlobalErrorHandler();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
        console.log('[Layout] Portrait lock not supported');
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UserPreferencesProvider>
      <SplashProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.dark.background }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <RootLayoutNav />
      </GestureHandlerRootView>
      </SplashProvider>
      </UserPreferencesProvider>
    </QueryClientProvider>
  );
}
