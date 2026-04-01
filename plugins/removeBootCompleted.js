/**
 * removeBootCompleted.js
 *
 * Usa le direttive UFFICIALI del Gradle Manifest Merger per eliminare
 * dal manifest finale BOOT_COMPLETED, i servizi audio di expo-audio,
 * e il permesso RECEIVE_BOOT_COMPLETED — anche se le librerie li re-iniettano.
 *
 * tools:node="replace" → sostituisce interamente il receiver di expo-notifications,
 *                         eliminando tutte le action BOOT_COMPLETED/REBOOT/QUICKBOOT.
 *
 * tools:node="remove"  → dice a Gradle di CANCELLARE l'elemento dal merge finale
 *                         anche se la libreria lo aggiunge.
 *
 * Riferimento: https://github.com/expo/expo/issues/41627
 * Docs: https://developer.android.com/studio/build/manage-manifests#merge-rules
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

module.exports = function withRemoveBootCompleted(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    /* ── Assicura namespace tools (obbligatorio per tools:node) ── */
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    /* ══════════════════════════════════════════════════════════
       PERMESSI — tools:node="remove" su RECEIVE_BOOT_COMPLETED
       Anche se expo-notifications lo aggiunge, Gradle lo rimuove.
       ══════════════════════════════════════════════════════════ */
    const perms = asArray(manifest['uses-permission']).filter(
      p => p.$?.['android:name'] !== 'android.permission.RECEIVE_BOOT_COMPLETED'
    );
    perms.push({
      $: {
        'android:name': 'android.permission.RECEIVE_BOOT_COMPLETED',
        'tools:node': 'remove',
      },
    });
    manifest['uses-permission'] = perms;
    console.log('[removeBootCompleted] ✓ RECEIVE_BOOT_COMPLETED → tools:node=remove.');

    const applications = asArray(manifest.application);
    for (const app of applications) {

      /* ══════════════════════════════════════════════════════════
         RECEIVER expo-notifications — tools:node="replace"
         Sostituisce interamente il receiver, tenendo solo
         NOTIFICATION_EVENT e MY_PACKAGE_REPLACED.
         Elimina BOOT_COMPLETED / REBOOT / QUICKBOOT_POWERON.
         ══════════════════════════════════════════════════════════ */
      const notifReceiverName = 'expo.modules.notifications.service.NotificationsService';
      const cleanReceiver = {
        $: {
          'android:name': notifReceiverName,
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
      const idx = receivers.findIndex(r => r?.$?.['android:name'] === notifReceiverName);
      if (idx >= 0) {
        receivers[idx] = cleanReceiver;
      } else {
        receivers.push(cleanReceiver);
      }
      app.receiver = receivers;
      console.log('[removeBootCompleted] ✓ NotificationsService receiver → tools:node=replace (BOOT_COMPLETED eliminato).');

      /* ══════════════════════════════════════════════════════════
         SERVIZI expo-audio — tools:node="remove"
         Rimuove AudioControlsService e AudioRecordingService
         dal merge finale, anche se expo-audio li inietta.
         ══════════════════════════════════════════════════════════ */
      const services = asArray(app.service).filter(
        s => !AUDIO_SERVICES_TO_REMOVE.includes(s.$?.['android:name'] ?? '')
      );

      for (const serviceName of AUDIO_SERVICES_TO_REMOVE) {
        services.push({
          $: {
            'android:name': serviceName,
            'tools:node': 'remove',
          },
        });
        console.log(`[removeBootCompleted] ✓ ${serviceName.split('.').pop()} → tools:node=remove.`);
      }

      app.service = services;
    }

    return config;
  });
};
