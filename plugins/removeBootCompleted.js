/**
 * removeBootCompleted.js
 *
 * Config plugin Expo che rimuove le azioni BOOT_COMPLETED / REBOOT /
 * QUICKBOOT_POWERON dal receiver di expo-notifications nel manifest Android.
 *
 * Motivo: Google Play (Android 15) segnala come violazione la presenza di un
 * BOOT_COMPLETED receiver nella stessa app che contiene foreground services di
 * tipo "mediaPlayback" o "microphone" (expo-audio).
 * I receiver e i servizi NON interagiscono, ma l'analisi statica del Play Store
 * è conservativa e li flagga comunque.
 *
 * Effetto: le notifiche in sospeso non vengono ripristinate dopo un riavvio
 * del dispositivo (accettabile: l'app non usa push notification in produzione).
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const BOOT_ACTIONS_TO_REMOVE = [
  'android.intent.action.BOOT_COMPLETED',
  'android.intent.action.REBOOT',
  'android.intent.action.QUICKBOOT_POWERON',
  'com.htc.intent.action.QUICKBOOT_POWERON',
];

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = function withRemoveBootCompleted(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const applications = manifest.application ?? [];

    for (const application of applications) {
      const receivers = application.receiver ?? [];

      for (const receiver of receivers) {
        const intentFilters = receiver['intent-filter'] ?? [];

        for (const filter of intentFilters) {
          const actions = filter.action ?? [];
          const hasBoot = actions.some((a) =>
            BOOT_ACTIONS_TO_REMOVE.includes(a.$?.['android:name'] ?? '')
          );

          if (hasBoot) {
            /* Rimuove solo le azioni di boot — il receiver continua a gestire
               NOTIFICATION_EVENT e MY_PACKAGE_REPLACED normalmente */
            filter.action = actions.filter(
              (a) => !BOOT_ACTIONS_TO_REMOVE.includes(a.$?.['android:name'] ?? '')
            );
            console.log(
              '[removeBootCompleted] Rimosse azioni BOOT_COMPLETED dal receiver:',
              receiver.$?.['android:name'] ?? '(sconosciuto)'
            );
          }
        }
      }
    }

    /* Rimuove anche il permesso RECEIVE_BOOT_COMPLETED (non più necessario) */
    const permissions = manifest['uses-permission'] ?? [];
    const before = permissions.length;
    manifest['uses-permission'] = permissions.filter(
      (p) => p.$?.['android:name'] !== 'android.permission.RECEIVE_BOOT_COMPLETED'
    );
    if (manifest['uses-permission'].length < before) {
      console.log('[removeBootCompleted] Rimosso permesso RECEIVE_BOOT_COMPLETED');
    }

    return config;
  });
};
