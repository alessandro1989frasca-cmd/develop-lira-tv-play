#!/usr/bin/env bash
set -e
echo "[EAS hook] Patching expo-location for Gradle 8 compatibility..."
node scripts/fix-expo-location.js
