#!/usr/bin/env bash
set -e

DIST="extension/dist"
REMOTE="/sdcard/Download/tide.xpi"

if [ -z "$AMO_API_KEY" ] || [ -z "$AMO_API_SECRET" ]; then
  echo "Error: AMO_API_KEY and AMO_API_SECRET must be set"
  exit 1
fi

BROWSER=firefox pnpm build

XPI=$(pnpm exec web-ext sign \
  --source-dir "$DIST" \
  --api-key "$AMO_API_KEY" \
  --api-secret "$AMO_API_SECRET" \
  --channel unlisted \
  --no-input \
  2>&1 | grep "Signed .* extension" | grep -o '[^ ]*\.xpi')

if [ -z "$XPI" ]; then
  echo "Error: could not find signed XPI path in web-ext output"
  exit 1
fi

adb push "$XPI" "$REMOTE"
adb shell am start -a android.intent.action.VIEW \
  -t "application/x-xpinstall" \
  -d "file://$REMOTE" \
  org.mozilla.fenix/org.mozilla.fenix.IntentReceiverActivity

echo "Done. Accept the install prompt on your phone."
