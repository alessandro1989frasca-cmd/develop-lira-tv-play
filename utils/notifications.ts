import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const NOTIF_PREF_KEY = 'lira_tv_urgent_notif_enabled';
const NOTIF_TOKEN_KEY = 'lira_tv_push_token';

export type NotifStatus = 'unknown' | 'granted' | 'denied' | 'loading';

export async function loadNotifPreference(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_PREF_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function saveNotifPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_PREF_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export async function getCurrentPermissionStatus(): Promise<NotifStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function requestAndRegisterNotifications(): Promise<NotifStatus> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('urgent-news', {
        name: 'Notizie Urgenti',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EF4444',
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      return 'denied';
    }

    await saveNotifPreference(true);

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'b92878f0-1546-48fd-a3b8-69ae95ea42b4',
      });
      const token = tokenData.data;

      await AsyncStorage.setItem(NOTIF_TOKEN_KEY, token);

      await supabase.from('push_tokens').upsert(
        { token, platform: Platform.OS, enabled: true },
        { onConflict: 'token' }
      );
    } catch (tokenErr) {
      console.warn('Push token registration failed (FCM non configurato?):', tokenErr);
    }

    return 'granted';
  } catch {
    return 'denied';
  }
}

export async function disableNotifications(): Promise<void> {
  try {
    await saveNotifPreference(false);
    const token = await AsyncStorage.getItem(NOTIF_TOKEN_KEY);
    if (token) {
      await supabase
        .from('push_tokens')
        .update({ enabled: false })
        .eq('token', token);
    }
  } catch {}
}
