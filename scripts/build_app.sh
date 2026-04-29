#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Gifferson"
BUNDLE_DIR="$ROOT_DIR/Build/$APP_NAME.app"
EXECUTABLE_NAME="Gifferson"
VENDORED_GIFSKI="$ROOT_DIR/Vendor/gifski/bin/gifski"

cd "$ROOT_DIR"
if [[ ! -x "$VENDORED_GIFSKI" ]]; then
  "$ROOT_DIR/scripts/vendor_gifski.sh"
fi

swift build -c release --product "$EXECUTABLE_NAME"

rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/Contents/MacOS" "$BUNDLE_DIR/Contents/Resources/bin" "$BUNDLE_DIR/Contents/Resources/licenses/gifski"

cp ".build/release/$EXECUTABLE_NAME" "$BUNDLE_DIR/Contents/MacOS/$EXECUTABLE_NAME"
cp "$VENDORED_GIFSKI" "$BUNDLE_DIR/Contents/Resources/bin/gifski"
chmod 755 "$BUNDLE_DIR/Contents/Resources/bin/gifski"
cp "$ROOT_DIR/Vendor/gifski/LICENSE" "$BUNDLE_DIR/Contents/Resources/licenses/gifski/LICENSE"
cp "$ROOT_DIR/Vendor/gifski/VERSION" "$BUNDLE_DIR/Contents/Resources/licenses/gifski/VERSION"

cat > "$BUNDLE_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$EXECUTABLE_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>com.gifferson.app</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key>
  <true/>
</dict>
</plist>
PLIST

echo "Built $BUNDLE_DIR"
