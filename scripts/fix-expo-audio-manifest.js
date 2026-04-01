#!/usr/bin/env node
/**
 * Patcha expo-audio ed expo-notifications per Android 15 compliance.
 *
 * PROBLEMA: Google Play vieta ai BOOT_COMPLETED receiver di avviare foreground
 * service di tipo "mediaPlayback" o "microphone" (Android 15). L'analisi statica
 * trova sia le dichiarazioni nel manifest che i metodi nel bytecode DEX.
 *
 * CAUSA RADICE: il withAndroidManifest config plugin NON è sufficiente perché
 * Gradle fonde i manifest di tutte le librerie DOPO il prebuild — quindi
 * BOOT_COMPLETED torna dentro da expo-notifications e i servizi audio da expo-audio.
 *
 * SOLUZIONE: patchare i manifest SORGENTE delle librerie prima che Gradle li legga,
 * E sovrascrivere i file Kotlin con stub che non usano startForeground.
 */

const fs = require('fs');
const path = require('path');

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

if (fs.existsSync(controlsPath)) {
  fs.writeFileSync(controlsPath, STUB_CONTROLS, 'utf8');
  console.log('[fix-expo-audio] ✓ AudioControlsService.kt → stub (no startForeground).');
}

if (fs.existsSync(recordingPath)) {
  fs.writeFileSync(recordingPath, STUB_RECORDING, 'utf8');
  console.log('[fix-expo-audio] ✓ AudioRecordingService.kt → stub (no startForeground).');
}

console.log('[fix-expo-audio] ✓ Tutto patchato. App conforme ad Android 15.');
