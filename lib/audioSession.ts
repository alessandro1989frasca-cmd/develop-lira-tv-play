import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

let _isConfigured = false;

export async function configureAudioSession(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (_isConfigured) {
    console.log('[AudioSession] Already configured, skipping');
    return;
  }

  try {
    console.log('[AudioSession] Configuring audio session...');
    if (Platform.OS === 'ios') {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'duckOthers',
      });
    } else {
      await setAudioModeAsync({
        shouldPlayInBackground: true,
        interruptionModeAndroid: 'duckOthers',
      });
    }
    _isConfigured = true;
    console.log('[AudioSession] Audio session configured successfully');
  } catch (error) {
    console.log('[AudioSession] Failed to configure audio session:', error);
  }
}

export async function deactivateAudioSession(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!_isConfigured) return;

  try {
    console.log('[AudioSession] Deactivating audio session...');
    if (Platform.OS === 'ios') {
      await setAudioModeAsync({
        playsInSilentMode: false,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
      });
    } else {
      await setAudioModeAsync({
        shouldPlayInBackground: false,
        interruptionModeAndroid: 'duckOthers',
      });
    }
    _isConfigured = false;
    console.log('[AudioSession] Audio session deactivated');
  } catch (error) {
    console.log('[AudioSession] Failed to deactivate audio session:', error);
  }
}
