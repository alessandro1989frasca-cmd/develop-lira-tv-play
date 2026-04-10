#!/bin/bash
set -e

echo "[post-merge] Installing npm dependencies..."
npm install --legacy-peer-deps

echo "[post-merge] Running fix-expo-location patch..."
node scripts/fix-expo-location.js || true

echo "[post-merge] Done."
