import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Notifications from "expo-notifications";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar, Platform, AppState, AppStateStatus } from "react-native";
import Colors from "@/constants/colors";
import { UserPreferencesProvider } from "@/providers/UserPreferencesProvider";
import { SplashProvider } from "@/providers/SplashProvider";
import { AppConfigProvider } from "@/providers/AppConfigProvider";
import { setupGlobalErrorHandler } from "@/lib/errorReporter";
import { initQueryClient } from "@/utils/dataService";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
initQueryClient(queryClient);

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
      <Stack.Screen
        name="event-live"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "fade",
        }}
      />
    </Stack>
  );
}

const VIDEO_CACHE_EXPIRY = 5 * 60 * 1000;

export default function RootLayout() {
  const backgroundedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    void SplashScreen.hideAsync();
    if (Platform.OS !== 'web') {
      setupGlobalErrorHandler();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
        console.log('[Layout] Portrait lock not supported');
      });
    }
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('urgent-news', {
        name: 'Notizie Urgenti',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EF4444',
        enableVibrate: true,
        showBadge: true,
      }).catch(() => {});
    }

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (nextState === 'active' && prev.match(/inactive|background/)) {
        const elapsed = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : Infinity;
        if (elapsed >= VIDEO_CACHE_EXPIRY) {
          console.log('[Layout] App foregrounded after', Math.round(elapsed / 1000), 's — refreshing videos');
          queryClient.refetchQueries({ queryKey: ['videos'] }).catch(() => {});
        }
      }
    });

    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider>
      <UserPreferencesProvider>
      <SplashProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.dark.background }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <RootLayoutNav />
      </GestureHandlerRootView>
      </SplashProvider>
      </UserPreferencesProvider>
      </AppConfigProvider>
    </QueryClientProvider>
  );
}
