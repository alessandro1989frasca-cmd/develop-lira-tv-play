#!/usr/bin/env node
/**
 * Patches expo-image's GlideUrlWrapperLoader.kt to be compatible with Kotlin 2.x
 * - Fixes nullable ResponseBody? passed to ProgressResponseBody (non-nullable)
 * - Kotlin 1.9.x allowed this with a warning; Kotlin 2.0+ treats it as an error
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-image',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'image',
  'okhttp',
  'GlideUrlWrapperLoader.kt'
);

if (!fs.existsSync(filePath)) {
  console.log('[fix-expo-image-kotlin] GlideUrlWrapperLoader.kt not found, skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');
const original = content;

const oldCode = `              .body(
                ProgressResponseBody(originalResponse.body) { bytesWritten, contentLength, done ->
                  model.progressListener?.onProgress(bytesWritten, contentLength, done)
                }
              )`;

const newCode = `              .body(
                originalResponse.body?.let { body ->
                  ProgressResponseBody(body) { bytesWritten, contentLength, done ->
                    model.progressListener?.onProgress(bytesWritten, contentLength, done)
                  }
                } ?: originalResponse.body
              )`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[fix-expo-image-kotlin] Patched GlideUrlWrapperLoader.kt for Kotlin 2.x null safety.');
} else if (content.includes('originalResponse.body?.let')) {
  console.log('[fix-expo-image-kotlin] Already patched, skipping.');
} else {
  console.log('[fix-expo-image-kotlin] Pattern not found — expo-image may have been updated. Check manually.');
}
