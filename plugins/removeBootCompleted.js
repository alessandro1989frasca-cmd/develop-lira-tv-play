/**
 * removeBootCompleted.js
 *
 * Config plugin che usa tools:node="replace" per sovrascrivere il receiver
 * di expo-notifications nel manifest finale di Gradle, rimuovendo le azioni
 * BOOT_COMPLETED / REBOOT / QUICKBOOT_POWERON.
 *
 * Il tools:node="replace" è il meccanismo ufficiale Android per fare override
 * dei manifest delle librerie durante il merge Gradle — senza di esso il merger
 * ignora le modifiche fatte dal config plugin e fonde il receiver originale.
 *
 * Rimuove anche AudioControlsService e AudioRecordingService di expo-audio
 * come layer aggiuntivo (layer principale è il postinstall script).
 *
 * Riferimento: https://github.com/expo/expo/issues/41627
 */

const { withAndroidManifest } = require('@expo/config-plugins');

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const AUDIO_SERVICES_TO_REMOVE = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

const PERMISSIONS_TO_REMOVE = [
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.RECORD_AUDIO',
];

module.exports = function withRemoveBootCompleted(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    /* ── Assicura namespace tools ── */
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const applications = asArray(manifest.application);
    for (const app of applications) {

      /* ── 1. Sostituisce NotificationsService receiver con tools:node="replace"
              Mantiene solo NOTIFICATION_EVENT, rimuove BOOT_COMPLETED e varianti ── */
      const targetName = 'expo.modules.notifications.service.NotificationsService';
      const replacementReceiver = {
        $: {
          'android:name': targetName,
          'android:enabled': 'true',
          'android:exported': 'false',
          'tools:node': 'replace',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '-1' },
            action: [
              { $: { 'android:name': 'expo.modules.notifications.NOTIFICATION_EVENT' } },
              { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
            ],
          },
        ],
      };

      const receivers = asArray(app.receiver);
      const idx = receivers.findIndex(
        (r) => r?.$?.['android:name'] === targetName
      );

      if (idx >= 0) {
        receivers[idx] = replacementReceiver;
        console.log('[removeBootCompleted] ✓ NotificationsService receiver sostituito (tools:node=replace).');
      } else {
        receivers.push(replacementReceiver);
        console.log('[removeBootCompleted] ✓ NotificationsService receiver aggiunto con tools:node=replace.');
      }
      app.receiver = receivers;

      /* ── 2. Rimuove AudioControlsService e AudioRecordingService ── */
      const servicesBefore = asArray(app.service).length;
      app.service = asArray(app.service).filter((service) => {
        const name = service.$?.['android:name'] ?? '';
        const shouldRemove = AUDIO_SERVICES_TO_REMOVE.includes(name);
        if (shouldRemove) {
          console.log('[removeBootCompleted] ✓ Rimosso servizio audio:', name);
        }
        return !shouldRemove;
      });
      if (asArray(app.service).length < servicesBefore) {
        console.log('[removeBootCompleted] ✓ Servizi audio rimossi dal manifest.');
      }
    }

    /* ── 3. Rimuove permessi non necessari ── */
    const permsBefore = asArray(manifest['uses-permission']).length;
    manifest['uses-permission'] = asArray(manifest['uses-permission']).filter(
      (p) => !PERMISSIONS_TO_REMOVE.includes(p.$?.['android:name'] ?? '')
    );
    const permsRemoved = permsBefore - asArray(manifest['uses-permission']).length;
    if (permsRemoved > 0) {
      console.log(`[removeBootCompleted] ✓ Rimossi ${permsRemoved} permessi non necessari.`);
    }

    return config;
  });
};
