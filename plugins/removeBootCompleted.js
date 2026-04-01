/**
 * removeBootCompleted.js
 *
 * Config plugin Expo che:
 * 1. Rimuove le azioni BOOT_COMPLETED / REBOOT / QUICKBOOT_POWERON dal receiver
 *    di expo-notifications nel manifest Android (layer 1).
 * 2. Rimuove le dichiarazioni di AudioControlsService e AudioRecordingService dal
 *    manifest Android — nel caso in cui expo-audio le abbia già scritte tramite il
 *    suo config plugin (layer 2, belt-and-suspenders).
 * 3. Rimuove i permessi RECEIVE_BOOT_COMPLETED e RECORD_AUDIO dal manifest Android
 *    (non necessari su Android con expo-audio escluso dall'autolinking).
 *
 * Contesto:
 * - Google Play (Android 15) segnala come violazione la presenza di BOOT_COMPLETED
 *   receiver nella stessa app che contiene foreground service di tipo "mediaPlayback"
 *   o "microphone" (expo-audio: AudioControlsService / AudioRecordingService).
 * - expo-audio è già escluso dall'autolinking Android in app.json (la soluzione
 *   principale), ma questo plugin garantisce che le dichiarazioni non compaiano nel
 *   manifest nemmeno se il config plugin di expo-audio le avesse già scritte.
 * - Su iOS expo-audio rimane attivo normalmente.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const BOOT_ACTIONS_TO_REMOVE = [
  'android.intent.action.BOOT_COMPLETED',
  'android.intent.action.REBOOT',
  'android.intent.action.QUICKBOOT_POWERON',
  'com.htc.intent.action.QUICKBOOT_POWERON',
];

const AUDIO_SERVICES_TO_REMOVE = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

const PERMISSIONS_TO_REMOVE = [
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.RECORD_AUDIO',
];

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = function withRemoveBootCompleted(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const applications = manifest.application ?? [];

    for (const application of applications) {
      /* ── 1. Rimuove azioni BOOT dal receiver di expo-notifications ── */
      const receivers = application.receiver ?? [];
      for (const receiver of receivers) {
        const intentFilters = receiver['intent-filter'] ?? [];
        for (const filter of intentFilters) {
          const actions = filter.action ?? [];
          const hasBoot = actions.some((a) =>
            BOOT_ACTIONS_TO_REMOVE.includes(a.$?.['android:name'] ?? '')
          );
          if (hasBoot) {
            filter.action = actions.filter(
              (a) => !BOOT_ACTIONS_TO_REMOVE.includes(a.$?.['android:name'] ?? '')
            );
            console.log(
              '[removeBootCompleted] Rimosse azioni BOOT dal receiver:',
              receiver.$?.['android:name'] ?? '(sconosciuto)'
            );
          }
        }
      }

      /* ── 2. Rimuove AudioControlsService e AudioRecordingService ── */
      const servicesBefore = (application.service ?? []).length;
      application.service = (application.service ?? []).filter((service) => {
        const name = service.$?.['android:name'] ?? '';
        const shouldRemove = AUDIO_SERVICES_TO_REMOVE.includes(name);
        if (shouldRemove) {
          console.log('[removeBootCompleted] Rimosso servizio:', name);
        }
        return !shouldRemove;
      });
      if ((application.service ?? []).length < servicesBefore) {
        console.log('[removeBootCompleted] Servizi audio rimossi dal manifest Android');
      }
    }

    /* ── 3. Rimuove permessi non necessari su Android ── */
    const permissionsBefore = (manifest['uses-permission'] ?? []).length;
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter(
      (p) => !PERMISSIONS_TO_REMOVE.includes(p.$?.['android:name'] ?? '')
    );
    const permissionsRemoved = permissionsBefore - (manifest['uses-permission'] ?? []).length;
    if (permissionsRemoved > 0) {
      console.log(`[removeBootCompleted] Rimossi ${permissionsRemoved} permessi non necessari`);
    }

    return config;
  });
};
