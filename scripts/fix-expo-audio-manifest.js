#!/usr/bin/env node
/**
 * Patcha expo-audio per Android 15 compliance:
 * 1. Rimuove AudioControlsService e AudioRecordingService dal AndroidManifest.xml
 * 2. Sovrascrive i file Kotlin dei servizi con stub innocui che non usano
 *    startForeground — così le classi vengono compilate nel DEX ma senza
 *    foreground service, e il Play Store non le segnala.
 */

const fs = require('fs');
const path = require('path');

const audioDir = path.join(__dirname, '..', 'node_modules', 'expo-audio', 'android');

if (!fs.existsSync(audioDir)) {
  console.log('[fix-expo-audio] expo-audio non trovato, skip.');
  process.exit(0);
}

/* ── 1. Patch AndroidManifest.xml ── */
const manifestPath = path.join(audioDir, 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let content = fs.readFileSync(manifestPath, 'utf8');
  const original = content;

  content = content.replace(/[ \t]*<service[\s\S]*?AudioControlsService[\s\S]*?<\/service>\s*/g, '');
  content = content.replace(/[ \t]*<service[\s\S]*?AudioRecordingService[\s\S]*?\/>\s*/g, '');
  content = content.replace(/[ \t]*<uses-permission\s+android:name="android\.permission\.RECORD_AUDIO"\s*\/>\s*/g, '');
  content = content.replace(/[ \t]*<uses-permission\s+android:name="android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK"\s*\/>\s*/g, '');

  if (content !== original) {
    fs.writeFileSync(manifestPath, content, 'utf8');
    console.log('[fix-expo-audio] ✓ AndroidManifest.xml patchato.');
  } else {
    console.log('[fix-expo-audio] Manifest già patchato o formato non riconosciuto.');
  }

  const check = fs.readFileSync(manifestPath, 'utf8');
  if (check.includes('AudioControlsService') || check.includes('AudioRecordingService')) {
    console.error('[fix-expo-audio] ✗ Patch manifest fallita!');
    process.exit(1);
  }
}

/* ── 2. Stub dei file Kotlin dei servizi ── */
const serviceDir = path.join(
  audioDir,
  'src', 'main', 'java', 'expo', 'modules', 'audio', 'service'
);

const STUB_CONTROLS = `package expo.modules.audio.service

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Stub: AudioControlsService rimosso per Android 15 compliance (no foreground service). */
class AudioControlsService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
}
`;

const STUB_RECORDING = `package expo.modules.audio.service

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Stub: AudioRecordingService rimosso per Android 15 compliance (no foreground service). */
class AudioRecordingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
}
`;

const controlsPath = path.join(serviceDir, 'AudioControlsService.kt');
const recordingPath = path.join(serviceDir, 'AudioRecordingService.kt');

if (fs.existsSync(controlsPath)) {
  fs.writeFileSync(controlsPath, STUB_CONTROLS, 'utf8');
  console.log('[fix-expo-audio] ✓ AudioControlsService.kt sostituito con stub.');
}

if (fs.existsSync(recordingPath)) {
  fs.writeFileSync(recordingPath, STUB_RECORDING, 'utf8');
  console.log('[fix-expo-audio] ✓ AudioRecordingService.kt sostituito con stub.');
}

console.log('[fix-expo-audio] ✓ Completato. Le classi servizio non useranno più startForeground.');
