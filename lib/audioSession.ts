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
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      interruptionModeAndroid: 'duckOthers',
    });
    _isConfigured = true;
    console.log('[AudioSession] Audio session configured successfully');
  } catch (error) {
    console.log('[AudioSession] Failed to configure audio session:', error);
  }
}

export async function deactivateAudioSession(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    console.log('[AudioSession] Deactivating audio session...');
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
      interruptionModeAndroid: 'duckOthers',
    });
    _isConfigured = false;
    console.log('[AudioSession] Audio session deactivated');
  } catch (error) {
    console.log('[AudioSession] Failed to deactivate audio session:', error);
  }
}
