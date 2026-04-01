import { Platform } from 'react-native';

let _isConfigured = false;

/**
 * Configura la sessione audio per la riproduzione in background e modalità silenziosa.
 *
 * Su Android expo-audio è escluso dall'autolinking (i servizi AudioControlsService e
 * AudioRecordingService non sono compilati nell'APK) perché causano warning Play Store su
 * Android 15+ riguardo ai foreground service types ristretti avviati da BOOT_COMPLETED.
 * Su Android il background playback è gestito direttamente da expo-video (ExoPlayer).
 *
 * Su iOS expo-audio è necessario per abilitare la riproduzione in modalità silenziosa
 * e in background tramite AVAudioSession.
 */
export async function configureAudioSession(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (_isConfigured) {
    console.log('[AudioSession] Already configured, skipping');
    return;
  }

  try {
    console.log('[AudioSession] Configuring audio session (iOS)...');
    const { setAudioModeAsync } = await import('expo-audio');
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });
    _isConfigured = true;
    console.log('[AudioSession] Audio session configured successfully');
  } catch (error) {
    console.log('[AudioSession] Failed to configure audio session:', error);
  }
}

export async function deactivateAudioSession(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!_isConfigured) return;

  try {
    console.log('[AudioSession] Deactivating audio session (iOS)...');
    const { setAudioModeAsync } = await import('expo-audio');
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
    _isConfigured = false;
    console.log('[AudioSession] Audio session deactivated');
  } catch (error) {
    console.log('[AudioSession] Failed to deactivate audio session:', error);
  }
}
