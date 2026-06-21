#!/usr/bin/env bash
set -e

DIST="extension/dist"
FIREFOX_APK="${FIREFOX_APK:-org.mozilla.fenix}"

if ! command -v adb >/dev/null 2>&1; then
  echo "Error: adb not found on PATH"
  exit 1
fi

DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
if [ -z "$DEVICE" ]; then
  echo "Error: no authorized Android device found (check 'adb devices')"
  exit 1
fi

if ! adb shell pm list packages 2>/dev/null | grep -q "$FIREFOX_APK"; then
  echo "Error: $FIREFOX_APK is not installed on $DEVICE"
  echo "Set FIREFOX_APK to the package id of your Firefox build if it differs"
  exit 1
fi

echo "Building dev extension (BROWSER=firefox)..."
BROWSER=firefox pnpm build

echo "Side-loading onto $DEVICE ($FIREFOX_APK)..."
echo "Enable 'Remote debugging via USB' in Firefox settings if this hangs."

exec pnpm exec web-ext run \
  --target firefox-android \
  --android-device "$DEVICE" \
  --firefox-apk "$FIREFOX_APK" \
  --source-dir "$DIST"
