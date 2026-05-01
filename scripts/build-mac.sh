#!/usr/bin/env bash
# Build a universal (arm64 + x64) unsigned DMG for macOS.
#
# Usage:
#   bash scripts/build-mac.sh                  # local build only
#   GH_TOKEN=ghp_xxx bash scripts/build-mac.sh always   # build + publish to GitHub Releases
#
# The "always" mode requires `repository.url` in package.json to point at the
# target GitHub repo and a GH_TOKEN with repo write access.

set -euo pipefail

cd "$(dirname "$0")/.."

PUBLISH="${1:-never}"

# CLAUDE.md SDKROOT workaround: Apple clang 16 chokes on the newest SDK's
# stdlib while building node-pty. Pin to MacOSX15.sdk + system Python.
export PYTHON=/usr/bin/python3
export npm_config_python=/usr/bin/python3
if [ -d "/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk" ]; then
  export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk
fi

echo "==> Building renderer + main bundle"
npm run build

echo "==> Rebuilding node-pty for x64"
npx --yes electron-rebuild -f -w node-pty --arch=x64

echo "==> Rebuilding node-pty for arm64"
npx --yes electron-rebuild -f -w node-pty --arch=arm64

echo "==> Packaging universal DMG (publish=$PUBLISH)"
npx --yes electron-builder --mac dmg --universal --publish="$PUBLISH"

echo
echo "==> Built artifacts:"
ls -1 release/*.dmg release/latest-mac.yml 2>/dev/null || true
