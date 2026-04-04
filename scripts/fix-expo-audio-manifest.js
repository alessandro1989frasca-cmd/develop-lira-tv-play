#!/usr/bin/env node
/**
 * Patcha expo-audio ed expo-notifications per Android 15 compliance.
 *
 * PROBLEMA: Google Play vieta ai BOOT_COMPLETED receiver di avviare foreground
 * service di tipo "mediaPlayback" o "microphone" (Android 15). L'analisi statica
 * trova sia le dichiarazioni nel manifest che i metodi nel bytecode DEX.
 *
 * CAUSA RADICE 1: expo-audio ha un AAR pre-compilato in local-maven-repo che Gradle
 * include nel build nonostante l'esclusione dall'autolinking.
 *   → FIX PRIMARIO: withSettingsGradle aggiunge `expoAutolinking.exclude = ["expo-audio"]`
 *     in settings.gradle PRIMA di useExpoModules() — questo impedisce a Gradle di
 *     includere expo-audio come progetto o dipendenza Maven.
 *   → FIX SECONDARIO (questo script): elimina local-maven-repo di expo-audio in modo
 *     che l'AAR non sia trovabile anche se l'exclusion fallisse.
 *
 * CAUSA RADICE 2: expo-notifications aggiunge BOOT_COMPLETED nel suo manifest sorgente.
 *   → FIX: rimuove le action BOOT_COMPLETED dal manifest sorgente E il config plugin
 *     withAndroidManifest usa tools:node="replace" sul receiver.
 *
 * SOLUZIONE COMPLETA: 4 strati di protezione.
 */

const fs = require('fs');
const path = require('path');

/* ══════════════════════════════════════════════════════════════
   PARTE 0 — expo-audio: elimina local-maven-repo (AAR pre-compilato)
   Questo impedisce a Gradle di trovare l'AAR anche se l'exclusion
   in settings.gradle non venisse rispettata.
   STRATO DI SICUREZZA aggiuntivo al withSettingsGradle plugin.
   ══════════════════════════════════════════════════════════════ */
const audioMavenRepo = path.join(
  __dirname, '..', 'node_modules', 'expo-audio', 'local-maven-repo'
);

if (fs.existsSync(audioMavenRepo)) {
  fs.rmSync(audioMavenRepo, { recursive: true, force: true });
  console.log('[fix-expo-audio] ✓ expo-audio/local-maven-repo eliminata (AAR pre-compilato rimosso).');
  console.log('[fix-expo-audio]   AudioControlsService e AudioRecordingService non entreranno nel DEX.');
} else {
  console.log('[fix-expo-audio] expo-audio/local-maven-repo già assente.');
}

/* ══════════════════════════════════════════════════════════════
   PARTE 1 — expo-notifications: rimuove BOOT_COMPLETED dal receiver
   ══════════════════════════════════════════════════════════════ */
const notifManifestPath = path.join(
  __dirname, '..', 'node_modules', 'expo-notifications',
  'android', 'src', 'main', 'AndroidManifest.xml'
);

if (fs.existsSync(notifManifestPath)) {
  let content = fs.readFileSync(notifManifestPath, 'utf8');
  const original = content;

  const BOOT_ACTIONS = [
    'android.intent.action.BOOT_COMPLETED',
    'android.intent.action.REBOOT',
    'android.intent.action.QUICKBOOT_POWERON',
    'com.htc.intent.action.QUICKBOOT_POWERON',
  ];

  for (const action of BOOT_ACTIONS) {
    // [^>]* gestisce attributi extra e spazi prima di /> o >
    content = content.replace(
      new RegExp(`[ \\t]*<action android:name="${action.replace(/\./g, '\\.')}[^>]*>\\s*\\n?`, 'g'),
      ''
    );
  }

  content = content.replace(
    /[ \t]*<uses-permission android:name="android\.permission\.RECEIVE_BOOT_COMPLETED"[^>]*>\s*\n?/g,
    ''
  );

  if (content !== original) {
    fs.writeFileSync(notifManifestPath, content, 'utf8');
    console.log('[fix-expo-audio] ✓ expo-notifications: rimossi BOOT_COMPLETED e RECEIVE_BOOT_COMPLETED.');
  } else {
    console.log('[fix-expo-audio] expo-notifications: manifest già patchato.');
  }

  const check = fs.readFileSync(notifManifestPath, 'utf8');
  if (check.includes('BOOT_COMPLETED') || check.includes('QUICKBOOT')) {
    console.error('[fix-expo-audio] ✗ Patch expo-notifications fallita!');
    process.exit(1);
  }
} else {
  console.log('[fix-expo-audio] expo-notifications non trovato, skip.');
}

/* ══════════════════════════════════════════════════════════════
   PARTE 2 — expo-audio: rimuove servizi dal manifest sorgente
   ══════════════════════════════════════════════════════════════ */
const audioManifestPath = path.join(
  __dirname, '..', 'node_modules', 'expo-audio',
  'android', 'src', 'main', 'AndroidManifest.xml'
);

if (fs.existsSync(audioManifestPath)) {
  let content = fs.readFileSync(audioManifestPath, 'utf8');
  const original = content;

  content = content.replace(/[ \t]*<service[\s\S]*?AudioControlsService[\s\S]*?<\/service>\s*/g, '');
  content = content.replace(/[ \t]*<service[\s\S]*?AudioRecordingService[\s\S]*?\/>\s*/g, '');
  content = content.replace(/[ \t]*<uses-permission\s+android:name="android\.permission\.RECORD_AUDIO"\s*\/>\s*/g, '');
  content = content.replace(/[ \t]*<uses-permission\s+android:name="android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK"\s*\/>\s*/g, '');

  if (content !== original) {
    fs.writeFileSync(audioManifestPath, content, 'utf8');
    console.log('[fix-expo-audio] ✓ expo-audio AndroidManifest.xml patchato.');
  } else {
    console.log('[fix-expo-audio] expo-audio manifest già patchato.');
  }

  const check = fs.readFileSync(audioManifestPath, 'utf8');
  if (check.includes('AudioControlsService') || check.includes('AudioRecordingService')) {
    console.error('[fix-expo-audio] ✗ Patch expo-audio manifest fallita!');
    process.exit(1);
  }
}

/* ══════════════════════════════════════════════════════════════
   PARTE 3 — expo-audio: sostituisce i file Kotlin con stub innocui
   I metodi startForegroundWithNotification / postOrStartForegroundNotification
   scompaiono dal bytecode DEX — il Play Store non li trova più.
   ══════════════════════════════════════════════════════════════ */
const serviceDir = path.join(
  __dirname, '..', 'node_modules', 'expo-audio',
  'android', 'src', 'main', 'java', 'expo', 'modules', 'audio', 'service'
);

const STUB_CONTROLS = `package expo.modules.audio.service

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Stub: rimosso per Android 15 compliance (no foreground service). */
class AudioControlsService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
}
`;

const STUB_RECORDING = `package expo.modules.audio.service

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Stub: rimosso per Android 15 compliance (no foreground service). */
class AudioRecordingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
}
`;

const controlsPath = path.join(serviceDir, 'AudioControlsService.kt');
const recordingPath = path.join(serviceDir, 'AudioRecordingService.kt');

const missingFiles = [
  { path: controlsPath, name: 'AudioControlsService.kt' },
  { path: recordingPath, name: 'AudioRecordingService.kt' },
].filter(f => !fs.existsSync(f.path));

if (missingFiles.length > 0) {
  console.error('\n[fix-expo-audio] ✗ Expo audio service files not found at expected paths. Patch not applied. Failing build.');
  for (const f of missingFiles) {
    console.error(`  Missing: ${f.path}`);
  }
  console.error('[fix-expo-audio] Expo may have changed the file paths or class names. Update the patch script before building.\n');
  process.exit(1);
}

fs.writeFileSync(controlsPath, STUB_CONTROLS, 'utf8');
console.log('[fix-expo-audio] ✓ AudioControlsService.kt → stub (no startForeground).');

fs.writeFileSync(recordingPath, STUB_RECORDING, 'utf8');
console.log('[fix-expo-audio] ✓ AudioRecordingService.kt → stub (no startForeground).');

console.log('[fix-expo-audio] ✓ Tutto patchato. App conforme ad Android 15.');
console.log('[fix-expo-audio] ✔ Expo audio services patched successfully.');
