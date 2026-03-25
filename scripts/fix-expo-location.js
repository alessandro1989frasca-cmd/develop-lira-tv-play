#!/usr/bin/env node
/**
 * Patches expo-location's android/build.gradle to be compatible with Gradle 8+
 * - Removes deprecated 'classifier' property (removed in Gradle 7+)
 * - Fixes 'compileSdkVersion' → 'compileSdk' (required in Gradle 8+)
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', 'expo-location', 'android', 'build.gradle');

if (!fs.existsSync(filePath)) {
  console.log('[fix-expo-location] expo-location not found, skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');
const original = content;

content = content.replace(/^\s*classifier\s*=\s*['"]sources['"]\s*$/m, '  archiveClassifier.set("sources")');
content = content.replace(/compileSdkVersion\s+safeExtGet/g, 'compileSdk safeExtGet');

if (content !== original) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[fix-expo-location] Patched expo-location/android/build.gradle for Gradle 8 compatibility.');
} else {
  console.log('[fix-expo-location] expo-location/android/build.gradle already patched or not matching expected content.');
}
