#!/usr/bin/env bash
# Install (or update) CLI Mods.app from a DMG.
#
# Usage:
#   bash scripts/install.sh ~/Downloads/CLI-Mods-0.1.0-universal.dmg
#   bash scripts/install.sh https://github.com/<owner>/CliCodeMod/releases/download/v0.1.0/CLI-Mods-0.1.0-universal.dmg
#
# Mounts the DMG, copies the .app to /Applications, ejects, clears the
# com.apple.quarantine xattr (Gatekeeper bypass for unsigned builds).

set -euo pipefail

SRC="${1:-}"
if [ -z "$SRC" ]; then
  echo "usage: install.sh <path-or-url-to-CLI-Mods.dmg>" >&2
  exit 1
fi

DMG="$SRC"
CLEANUP_DMG=""
if [[ "$SRC" =~ ^https?:// ]]; then
  DMG="$(mktemp -t climods).dmg"
  CLEANUP_DMG="$DMG"
  echo "==> Downloading $SRC"
  curl -fL --progress-bar "$SRC" -o "$DMG"
fi

echo "==> Mounting"
ATTACH_OUT="$(hdiutil attach -nobrowse -readonly "$DMG")"
MNT="$(printf '%s\n' "$ATTACH_OUT" | awk '/\/Volumes\// {sub(/^.*\/Volumes\//, "/Volumes/"); print; exit}')"
if [ -z "$MNT" ]; then
  echo "could not determine mount point from hdiutil output:" >&2
  echo "$ATTACH_OUT" >&2
  exit 1
fi

cleanup() {
  hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || true
  if [ -n "$CLEANUP_DMG" ] && [ -f "$CLEANUP_DMG" ]; then
    rm -f "$CLEANUP_DMG"
  fi
}
trap cleanup EXIT

APP="$MNT/CLI Mods.app"
if [ ! -d "$APP" ]; then
  echo "no 'CLI Mods.app' found in $MNT" >&2
  exit 1
fi

DEST="/Applications/CLI Mods.app"
echo "==> Copying to $DEST"
rm -rf "$DEST"
cp -R "$APP" /Applications/

echo "==> Clearing quarantine"
xattr -dr com.apple.quarantine "$DEST" || true

echo
echo "Done. Launch CLI Mods from /Applications or Spotlight."
