import * as Notifications from 'expo-notifications';
import { Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/deviceId';

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
    const settings = await Notifications.getPermissionsAsync();
    console.log('PERMISSION STATUS:', JSON.stringify(settings));
    if (settings.status === 'granted') return 'granted';
    if (settings.status === 'denied') return 'denied';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function requestAndRegisterNotifications(silent = false): Promise<NotifStatus> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('urgent-news', {
        name: 'Notizie Urgenti',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EF4444',
      });
    }

    const settings = await Notifications.requestPermissionsAsync();
    console.log('PERMISSION STATUS:', JSON.stringify(settings));

    if (settings.status !== 'granted') {
      if (!silent) {
        Alert.alert(
          'Notifiche non attive',
          'Devi attivare le notifiche dalle impostazioni',
          [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Apri Impostazioni', onPress: () => Linking.openSettings() },
          ]
        );
      }
      return 'denied';
    }

    if (Platform.OS === 'android') {
      await new Promise(r => setTimeout(r, 1500));
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'b92878f0-1546-48fd-a3b8-69ae95ea42b4',
      });
      const token = tokenData.data;

      console.log('EXPO TOKEN:', token);

      await AsyncStorage.setItem(NOTIF_TOKEN_KEY, token);
      await saveNotifPreference(true);

      const deviceId = await getDeviceId();

      await supabase.from('push_tokens').upsert(
        { token, platform: Platform.OS, enabled: true, device_id: deviceId },
        { onConflict: 'token' }
      );

      return 'granted';
    } catch (tokenErr: unknown) {
      console.log('❌ TOKEN ERROR:', tokenErr instanceof Error ? tokenErr.message : String(tokenErr));

      if (!silent) {
        Alert.alert(
          'Errore di rete',
          'Ops, c\'è un errore di rete. Cambia connessione e riprova ad attivare le notifiche.',
          [{ text: 'OK' }]
        );
      }

      return 'denied';
    }
  } catch (err) {
    console.error('requestAndRegisterNotifications error:', err);
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
