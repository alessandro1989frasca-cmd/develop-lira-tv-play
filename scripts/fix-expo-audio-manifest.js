#!/usr/bin/env node
/**
 * Patcha il AndroidManifest.xml nativo di expo-audio per rimuovere le
 * dichiarazioni di AudioControlsService (foregroundServiceType="mediaPlayback")
 * e AudioRecordingService (foregroundServiceType="microphone").
 *
 * Motivo: Google Play (Android 15) vieta ai BOOT_COMPLETED receiver di avviare
 * foreground service di tipo "mediaPlayback" o "microphone". L'analisi statica
 * del Play Store trova questi servizi nel bytecode/manifest dell'AAB.
 *
 * Questo script gira durante il postinstall (prima che EAS Build avvii Gradle),
 * così Gradle non trova mai le dichiarazioni nel manifest da mergeare.
 *
 * VERIFICA FINALE: se dopo il patch i servizi sono ancora presenti, lo script
 * esce con codice 1 — la build EAS fallisce con errore esplicito invece di
 * procedere silenziosamente con il problema.
 */

const fs = require('fs');
const path = require('path');

const manifestPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-audio',
  'android',
  'src',
  'main',
  'AndroidManifest.xml'
);

if (!fs.existsSync(manifestPath)) {
  console.log('[fix-expo-audio-manifest] expo-audio non trovato, skip.');
  process.exit(0);
}

let content = fs.readFileSync(manifestPath, 'utf8');
const original = content;

/* ── 1. Rimuove AudioControlsService con il suo intent-filter ── */
// Gestisce sia attributi su una riga che su righe multiple
content = content.replace(
  /[ \t]*<service[\s\S]*?AudioControlsService[\s\S]*?<\/service>\s*/g,
  ''
);

/* ── 2. Rimuove AudioRecordingService (self-closing tag) ── */
content = content.replace(
  /[ \t]*<service[\s\S]*?AudioRecordingService[\s\S]*?\/>\s*/g,
  ''
);

/* ── 3. Rimuove RECORD_AUDIO ── */
content = content.replace(
  /[ \t]*<uses-permission\s+android:name="android\.permission\.RECORD_AUDIO"\s*\/>\s*/g,
  ''
);

/* ── 4. Rimuove FOREGROUND_SERVICE_MEDIA_PLAYBACK (già dichiarato da expo-video) ── */
content = content.replace(
  /[ \t]*<uses-permission\s+android:name="android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK"\s*\/>\s*/g,
  ''
);

/* ── Scrive il file patchato ── */
if (content !== original) {
  fs.writeFileSync(manifestPath, content, 'utf8');
  console.log('[fix-expo-audio-manifest] ✓ Patchato expo-audio AndroidManifest.xml.');
  console.log('[fix-expo-audio-manifest]   Rimossi: AudioControlsService, AudioRecordingService, RECORD_AUDIO, FOREGROUND_SERVICE_MEDIA_PLAYBACK');
} else {
  console.log('[fix-expo-audio-manifest] Manifest già patchato o formato non riconosciuto.');
}

/* ── VERIFICA FINALE: blocca la build se i servizi sono ancora presenti ── */
const finalContent = fs.readFileSync(manifestPath, 'utf8');
const stillHasControlsService = finalContent.includes('AudioControlsService');
const stillHasRecordingService = finalContent.includes('AudioRecordingService');

if (stillHasControlsService || stillHasRecordingService) {
  console.error('[fix-expo-audio-manifest] ✗ ERRORE: patch fallito!');
  if (stillHasControlsService) {
    console.error('[fix-expo-audio-manifest]   AudioControlsService ancora presente nel manifest.');
  }
  if (stillHasRecordingService) {
    console.error('[fix-expo-audio-manifest]   AudioRecordingService ancora presente nel manifest.');
  }
  console.error('[fix-expo-audio-manifest]   Controlla il formato del manifest in node_modules/expo-audio/android/src/main/AndroidManifest.xml');
  process.exit(1); // ← Blocca npm install → blocca la build EAS
}

console.log('[fix-expo-audio-manifest] ✓ Verifica OK: nessun servizio audio nel manifest Android.');
