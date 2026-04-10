/**
 * removeBootCompleted.js
 *
 * Fix a tre livelli per Android 15 compliance:
 *
 * LIVELLO 1 — settings.gradle
 *   Usa withSettingsGradle per aggiungere `expoAutolinking.exclude = ["expo-audio"]`
 *   PRIMA di useExpoModules(). Questo è il modo CORRETTO di escludere un modulo
 *   dalla compilazione Gradle — il blocco autolinking.android.exclude in app.json
 *   NON viene letto da Gradle, viene ignorato.
 *
 * LIVELLO 2 — AndroidManifest (tools:node)
 *   tools:node="replace" sul receiver di expo-notifications → elimina BOOT_COMPLETED.
 *   tools:node="remove" su AudioControlsService e AudioRecordingService → li rimuove
 *   dal merge finale anche se expo-audio venisse incluso per altra via.
 *
 * LIVELLO 3 — permessi
 *   tools:node="remove" su RECEIVE_BOOT_COMPLETED.
 *
 * Riferimento: https://github.com/expo/expo/issues/41627
 * Docs merger: https://developer.android.com/studio/build/manage-manifests#merge-rules
 */

const { withAndroidManifest, withSettingsGradle } = require('@expo/config-plugins');

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const AUDIO_SERVICES_TO_REMOVE = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

/* ══════════════════════════════════════════════════════════════════════
   LIVELLO 1 — settings.gradle: esclude expo-audio dalla compilazione Gradle
   Aggiunge `expoAutolinking.exclude = ["expo-audio"]` prima di useExpoModules()
   ══════════════════════════════════════════════════════════════════════ */
function withExpoAudioExcluded(config) {
  return withSettingsGradle(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes('expoAutolinking.exclude')) {
      console.log('[removeBootCompleted] settings.gradle: exclude già presente.');
      return config;
    }

    // Inserisce PRIMA di useExpoModules()
    config.modResults.contents = contents.replace(
      'expoAutolinking.useExpoModules()',
      'expoAutolinking.exclude = ["expo-audio"]\nexpoAutolinking.useExpoModules()'
    );

    if (config.modResults.contents.includes('expoAutolinking.exclude')) {
      console.log('[removeBootCompleted] ✓ settings.gradle: expo-audio escluso da Gradle.');
    } else {
      console.warn('[removeBootCompleted] ⚠ settings.gradle: useExpoModules() non trovato, exclude non aggiunto.');
    }

    return config;
  });
}

/* ══════════════════════════════════════════════════════════════════════
   LIVELLO 2+3 — AndroidManifest: tools:node directives
   ══════════════════════════════════════════════════════════════════════ */
function withManifestFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    /* ── Assicura namespace tools ── */
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    /* ── RECEIVE_BOOT_COMPLETED → tools:node="remove" ── */
    const perms = asArray(manifest['uses-permission']).filter(
      p => p.$?.['android:name'] !== 'android.permission.RECEIVE_BOOT_COMPLETED'
    );
    perms.push({
      $: { 'android:name': 'android.permission.RECEIVE_BOOT_COMPLETED', 'tools:node': 'remove' },
    });
    manifest['uses-permission'] = perms;
    console.log('[removeBootCompleted] ✓ RECEIVE_BOOT_COMPLETED → tools:node=remove.');

    const applications = asArray(manifest.application);
    for (const app of applications) {

      /* ── NotificationsService receiver → tools:node="replace" ── */
      const notifReceiverName = 'expo.modules.notifications.service.NotificationsService';
      const cleanReceiver = {
        $: {
          'android:name': notifReceiverName,
          'android:enabled': 'true',
          'android:exported': 'false',
          'tools:node': 'replace',
        },
        'intent-filter': [{
          $: { 'android:priority': '-1' },
          action: [
            { $: { 'android:name': 'expo.modules.notifications.NOTIFICATION_EVENT' } },
            { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
          ],
        }],
      };

      const receivers = asArray(app.receiver);
      const idx = receivers.findIndex(r => r?.$?.['android:name'] === notifReceiverName);
      if (idx >= 0) receivers[idx] = cleanReceiver;
      else receivers.push(cleanReceiver);
      app.receiver = receivers;
      console.log('[removeBootCompleted] ✓ NotificationsService receiver → tools:node=replace (BOOT_COMPLETED eliminato).');

      /* ── Audio services → tools:node="remove" ── */
      const services = asArray(app.service).filter(
        s => !AUDIO_SERVICES_TO_REMOVE.includes(s.$?.['android:name'] ?? '')
      );
      for (const serviceName of AUDIO_SERVICES_TO_REMOVE) {
        services.push({ $: { 'android:name': serviceName, 'tools:node': 'remove' } });
        console.log(`[removeBootCompleted] ✓ ${serviceName.split('.').pop()} → tools:node=remove.`);
      }
      app.service = services;
    }

    return config;
  });
}

module.exports = function withRemoveBootCompleted(config) {
  config = withExpoAudioExcluded(config);
  config = withManifestFix(config);
  return config;
};
