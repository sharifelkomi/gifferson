#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="1.34.0"
ARCHIVE_NAME="gifski-$VERSION.tar.xz"
DOWNLOAD_URL="https://github.com/ImageOptim/gifski/releases/download/$VERSION/$ARCHIVE_NAME"
EXPECTED_SHA256="b9b6591aa163123d737353d9c8581efdf3234d28eeaa45329b31da905cd5a996"
VENDOR_DIR="$ROOT_DIR/Vendor/gifski"
TMP_DIR="$ROOT_DIR/.context/tmp/gifski-vendor"
ARCHIVE_PATH="$TMP_DIR/$ARCHIVE_NAME"

mkdir -p "$TMP_DIR" "$VENDOR_DIR/bin"

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  curl -L "$DOWNLOAD_URL" -o "$ARCHIVE_PATH"
fi

ACTUAL_SHA256="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"
if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
  echo "Checksum mismatch for $ARCHIVE_NAME" >&2
  echo "Expected: $EXPECTED_SHA256" >&2
  echo "Actual:   $ACTUAL_SHA256" >&2
  exit 1
fi

tar -xOf "$ARCHIVE_PATH" mac/gifski > "$VENDOR_DIR/bin/gifski"
tar -xOf "$ARCHIVE_PATH" LICENSE > "$VENDOR_DIR/LICENSE"
chmod 755 "$VENDOR_DIR/bin/gifski"
printf "%s\n" "$VERSION" > "$VENDOR_DIR/VERSION"

echo "Vendored gifski $VERSION at $VENDOR_DIR/bin/gifski"
